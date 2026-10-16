import { Company } from '../../../companies/entities/company.entity';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDailyStatusEnum } from '../../attendance/processing/enums/attendance-daily-status.enum';
import {
  DailyActivityEntry,
  DailyActivityReport,
} from '../../work-activities/entities/daily-activity.entities';
import {
  DailyActivityEntryReviewStatusEnum,
  DailyActivityReportStatusEnum,
  DailyActivityStatusEnum,
} from '../../work-activities/enums/work-activity.enums';
import { HrAccessService } from '../../shared/hr-access.service';
import { CreatePerformanceScorecardConfigDto } from '../dto/performance-scorecard-config.dto';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { PerformanceFeedback360Request } from '../entities/performance-feedback-360-request.entity';
import {
  PerformanceScorecardComponent,
  PerformanceScorecardConfig,
} from '../entities/performance-scorecard-config.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformancePeriodAssignment } from '../entities/performance-period-assignment.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformanceFeedback360StatusEnum } from '../enums/performance-feedback-360-status.enum';
import { PerformanceScorecardComponentTypeEnum } from '../enums/performance-scorecard-component-type.enum';
import { PerformanceAuditService } from './performance-audit.service';

type CalculatedScorecard = {
  kpiScore: string;
  competencyScore: string | null;
  adjustmentScore: string;
  finalScore: string;
  snapshot: Record<string, unknown>;
};

type ComponentScore = {
  code: string;
  label: string;
  type: PerformanceScorecardComponentTypeEnum;
  weight: string;
  rawScore: string | null;
  weightedScore: string;
  required: boolean;
  source: Record<string, unknown>;
};

const LEGACY_COMPONENTS: PerformanceScorecardComponent[] = [
  {
    code: 'KPI',
    label: 'KPI performance',
    type: PerformanceScorecardComponentTypeEnum.KPI,
    weight: 100,
    enabled: true,
    required: true,
  },
  {
    code: 'ADJUSTMENT',
    label: 'HR adjustment',
    type: PerformanceScorecardComponentTypeEnum.ADJUSTMENT,
    weight: 100,
    enabled: true,
    required: false,
  },
  {
    code: 'COMPETENCY',
    label: 'Competency score',
    type: PerformanceScorecardComponentTypeEnum.COMPETENCY,
    weight: 100,
    enabled: true,
    required: false,
  },
];

@Injectable()
export class PerformanceScorecardService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(PerformanceScorecardConfig)
    private readonly scorecardRepository: Repository<PerformanceScorecardConfig>,
    @InjectRepository(PerformancePeriod)
    private readonly periodRepository: Repository<PerformancePeriod>,
    @InjectRepository(DailyActivityEntry)
    private readonly activityEntryRepository: Repository<DailyActivityEntry>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(PerformanceFeedback360Request)
    private readonly feedback360Repository: Repository<PerformanceFeedback360Request>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreatePerformanceScorecardConfigDto,
  ): Promise<PerformanceScorecardConfig> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    this.validateDateRange(dto.effective_from, dto.effective_to);
    const components = this.normalizeComponents(dto.components);
    this.validateWeightTotal(components);

    const saved = await this.scorecardRepository.manager.transaction(
      async (manager) => {
        // Serialize default switches even when no default configuration exists yet.
        await manager.getRepository(Company).findOne({
          where: { id: companyId },
          lock: { mode: 'pessimistic_write' },
        });
        const repository = manager.getRepository(PerformanceScorecardConfig);
        if (dto.is_default) {
          await repository.update(
            { companyId, isDefault: true },
            { isDefault: false },
          );
        }

        return await repository.save(
          repository.create({
            companyId,
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            description: dto.description?.trim() ?? null,
            isDefault: dto.is_default ?? false,
            status: 'ACTIVE',
            effectiveFrom: dto.effective_from ?? null,
            effectiveTo: dto.effective_to ?? null,
            components,
            createdByCompanyUserId: actor.companyMembershipId ?? null,
          }),
        );
      },
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.SCORECARD_CONFIG_CREATED,
      actor,
      afterValues: this.configSnapshot(saved),
    });

    return saved;
  }

  async list(actor: AuthenticatedUser): Promise<PerformanceScorecardConfig[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.scorecardRepository.find({
      where: { companyId },
      order: { isDefault: 'DESC', id: 'DESC' },
    });
  }

  async calculateReviewScore(input: {
    companyId: number;
    assignment: PerformancePeriodAssignment;
    review: PerformanceReview;
    achievements: KpiAchievement[];
    adjustmentScore: number;
  }): Promise<CalculatedScorecard> {
    const period = await this.periodRepository.findOne({
      where: {
        id: input.assignment.performancePeriodId,
        companyId: input.companyId,
      },
    });
    if (!period) {
      throw new BadRequestException('Performance period not found.');
    }

    const scorecard = await this.resolveActiveScorecard(
      input.companyId,
      period,
    );
    const components = scorecard?.components ?? LEGACY_COMPONENTS;
    const componentScores: ComponentScore[] = [];

    for (const component of components.filter((item) => item.enabled)) {
      const raw = await this.resolveComponentRawScore(component, {
        ...input,
        period,
      });
      const bounded = this.applyBounds(raw, component);
      const weighted =
        bounded === null
          ? new Decimal(0)
          : bounded.mul(new Decimal(component.weight).div(100));
      componentScores.push({
        code: component.code,
        label: component.label,
        type: component.type,
        weight: new Decimal(component.weight).toDecimalPlaces(2).toFixed(2),
        rawScore: bounded?.toDecimalPlaces(4).toFixed(4) ?? null,
        weightedScore: weighted.toDecimalPlaces(4).toFixed(4),
        required: component.required ?? false,
        source: this.componentSource(component, raw),
      });
    }

    const kpiRaw = componentScores.find(
      (item) => item.type === PerformanceScorecardComponentTypeEnum.KPI,
    )?.rawScore;
    const competencyRaw = componentScores.find(
      (item) => item.type === PerformanceScorecardComponentTypeEnum.COMPETENCY,
    )?.rawScore;
    const adjustmentWeighted = componentScores
      .filter(
        (item) =>
          item.type === PerformanceScorecardComponentTypeEnum.ADJUSTMENT,
      )
      .reduce((sum, item) => sum.plus(item.weightedScore), new Decimal(0));
    const finalScore = componentScores.reduce(
      (sum, item) => sum.plus(item.weightedScore),
      new Decimal(0),
    );

    return {
      kpiScore:
        kpiRaw ??
        input.achievements
          .reduce(
            (sum, achievement) => sum.plus(achievement.weightedScore ?? 0),
            new Decimal(0),
          )
          .toDecimalPlaces(4)
          .toFixed(4),
      competencyScore: competencyRaw ?? input.review.competencyScore,
      adjustmentScore: adjustmentWeighted.toDecimalPlaces(4).toFixed(4),
      finalScore: finalScore.toDecimalPlaces(4).toFixed(4),
      snapshot: {
        scorecard_config_id: scorecard?.id ?? null,
        scorecard_code: scorecard?.code ?? 'LEGACY_FIXED_KPI',
        scorecard_name: scorecard?.name ?? 'Legacy fixed KPI calculation',
        performance_period_id: period.id,
        period_dates: {
          start_date: period.startDate,
          end_date: period.endDate,
        },
        components: componentScores,
      },
    };
  }

  private async resolveActiveScorecard(
    companyId: number,
    period: PerformancePeriod,
  ): Promise<PerformanceScorecardConfig | null> {
    const candidates = await this.scorecardRepository.find({
      where: { companyId, status: 'ACTIVE' },
      order: { isDefault: 'DESC', id: 'DESC' },
    });
    return (
      candidates.find(
        (config) =>
          (!config.effectiveFrom || config.effectiveFrom <= period.startDate) &&
          (!config.effectiveTo || config.effectiveTo >= period.endDate),
      ) ?? null
    );
  }

  private async resolveComponentRawScore(
    component: PerformanceScorecardComponent,
    input: {
      companyId: number;
      assignment: PerformancePeriodAssignment;
      review: PerformanceReview;
      achievements: KpiAchievement[];
      adjustmentScore: number;
      period: PerformancePeriod;
    },
  ): Promise<Decimal | null> {
    switch (component.type) {
      case PerformanceScorecardComponentTypeEnum.KPI:
        return input.achievements.reduce(
          (sum, achievement) => sum.plus(achievement.weightedScore ?? 0),
          new Decimal(0),
        );
      case PerformanceScorecardComponentTypeEnum.COMPETENCY:
        return input.review.competencyScore === null
          ? null
          : new Decimal(input.review.competencyScore);
      case PerformanceScorecardComponentTypeEnum.ACTIVITIES:
        return this.calculateActivityScore(input);
      case PerformanceScorecardComponentTypeEnum.ATTENDANCE:
        return this.calculateAttendanceScore(input);
      case PerformanceScorecardComponentTypeEnum.MANAGER_ASSESSMENT:
        return this.extractNumericScore(input.review.managerReview, [
          'manager_assessment_score',
          'manager_score',
          'overall_score',
        ]);
      case PerformanceScorecardComponentTypeEnum.SELF_ASSESSMENT:
        return this.extractNumericScore(input.review.employeeSelfReview, [
          'self_assessment_score',
          'self_score',
          'overall_score',
        ]);
      case PerformanceScorecardComponentTypeEnum.PEER_FEEDBACK: {
        const feedbackScore = await this.calculatePeerFeedbackScore(
          input.companyId,
          input.review.id,
        );
        return (
          feedbackScore ??
          this.extractNumericScore(input.review.hrReview, [
            component.code,
            `${component.code.toLowerCase()}_score`,
            'manual_score',
          ])
        );
      }
      case PerformanceScorecardComponentTypeEnum.MANUAL:
        return this.extractNumericScore(input.review.hrReview, [
          component.code,
          `${component.code.toLowerCase()}_score`,
          'manual_score',
        ]);
      case PerformanceScorecardComponentTypeEnum.ADJUSTMENT:
        return new Decimal(input.adjustmentScore);
      default:
        return null;
    }
  }

  private async calculateActivityScore(input: {
    companyId: number;
    assignment: PerformancePeriodAssignment;
    period: PerformancePeriod;
  }): Promise<Decimal | null> {
    const total = await this.activityEntryRepository
      .createQueryBuilder('entry')
      .innerJoin(
        DailyActivityReport,
        'report',
        'report.id = entry.dailyActivityReportId',
      )
      .where('entry.companyId = :companyId', { companyId: input.companyId })
      .andWhere('report.employeeId = :employeeId', {
        employeeId: input.assignment.employeeId,
      })
      .andWhere('report.activityDate >= :startDate', {
        startDate: input.period.startDate,
      })
      .andWhere('report.activityDate <= :endDate', {
        endDate: input.period.endDate,
      })
      .andWhere('entry.status != :cancelled', {
        cancelled: DailyActivityStatusEnum.CANCELLED,
      })
      .getCount();

    if (total === 0) return null;

    const completedApproved = await this.activityEntryRepository
      .createQueryBuilder('entry')
      .innerJoin(
        DailyActivityReport,
        'report',
        'report.id = entry.dailyActivityReportId',
      )
      .where('entry.companyId = :companyId', { companyId: input.companyId })
      .andWhere('report.employeeId = :employeeId', {
        employeeId: input.assignment.employeeId,
      })
      .andWhere('report.activityDate >= :startDate', {
        startDate: input.period.startDate,
      })
      .andWhere('report.activityDate <= :endDate', {
        endDate: input.period.endDate,
      })
      .andWhere('report.status = :reportStatus', {
        reportStatus: DailyActivityReportStatusEnum.APPROVED,
      })
      .andWhere('entry.status = :entryStatus', {
        entryStatus: DailyActivityStatusEnum.COMPLETED,
      })
      .andWhere(
        '(entry.reviewStatus = :approved OR entry.managerValidated = true)',
        { approved: DailyActivityEntryReviewStatusEnum.APPROVED },
      )
      .getCount();

    return new Decimal(completedApproved).div(total).mul(100);
  }

  private async calculateAttendanceScore(input: {
    companyId: number;
    assignment: PerformancePeriodAssignment;
    period: PerformancePeriod;
  }): Promise<Decimal | null> {
    const summaries = await this.attendanceRepository.find({
      where: {
        companyId: input.companyId,
        employeeId: input.assignment.employeeId,
      },
    });
    const periodSummaries = summaries.filter(
      (summary) =>
        summary.attendanceDate >= input.period.startDate &&
        summary.attendanceDate <= input.period.endDate,
    );
    const excluded = new Set<string>([
      AttendanceDailyStatusEnum.OFF_DAY,
      AttendanceDailyStatusEnum.HOLIDAY,
      AttendanceDailyStatusEnum.NO_SHIFT_SCHEDULE,
    ]);
    const eligible = periodSummaries.filter(
      (summary) => !excluded.has(summary.attendanceStatus),
    );
    if (!eligible.length) return null;

    const negativeStatuses = new Set<string>([
      AttendanceDailyStatusEnum.ABSENT,
      AttendanceDailyStatusEnum.UNPAID_LEAVE,
    ]);
    const presentDays = eligible.filter(
      (summary) => !negativeStatuses.has(summary.attendanceStatus),
    ).length;
    const attendanceRate = new Decimal(presentDays)
      .div(eligible.length)
      .mul(100);
    const lateEarlyMinutes = eligible.reduce(
      (sum, summary) =>
        sum + summary.lateMinutes + summary.earlyDepartureMinutes,
      0,
    );
    const punctualityPenalty = Decimal.min(
      20,
      new Decimal(lateEarlyMinutes).mul(0.25),
    );
    return Decimal.max(0, attendanceRate.minus(punctualityPenalty));
  }

  private async calculatePeerFeedbackScore(
    companyId: number,
    performanceReviewId: number,
  ): Promise<Decimal | null> {
    const submitted = await this.feedback360Repository.find({
      where: {
        companyId,
        performanceReviewId,
        status: PerformanceFeedback360StatusEnum.SUBMITTED,
      },
    });
    if (!submitted.length) return null;

    const total = submitted.reduce(
      (sum, item) => sum.plus(item.overallScore ?? 0),
      new Decimal(0),
    );
    return total.div(submitted.length);
  }

  private extractNumericScore(
    source: Record<string, unknown> | null,
    keys: string[],
  ): Decimal | null {
    if (!source) return null;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' || typeof value === 'string') {
        try {
          const decimal = new Decimal(value);
          if (decimal.isFinite()) return decimal;
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  private applyBounds(
    score: Decimal | null,
    component: PerformanceScorecardComponent,
  ): Decimal | null {
    if (score === null) return component.required ? new Decimal(0) : null;
    let bounded = score;
    if (component.floor !== null && component.floor !== undefined) {
      bounded = Decimal.max(bounded, new Decimal(component.floor));
    }
    if (component.cap !== null && component.cap !== undefined) {
      bounded = Decimal.min(bounded, new Decimal(component.cap));
    }
    return bounded;
  }

  private normalizeComponents(
    components: CreatePerformanceScorecardConfigDto['components'],
  ): PerformanceScorecardComponent[] {
    return components.map((component) => ({
      code: component.code.trim().toUpperCase(),
      label: component.label.trim(),
      type: component.type,
      weight: component.weight,
      enabled: component.enabled ?? true,
      required: component.required ?? false,
      cap: component.cap ?? 100,
      floor: component.floor ?? 0,
      configuration: component.configuration ?? null,
    }));
  }

  private validateWeightTotal(components: PerformanceScorecardComponent[]) {
    const total = components
      .filter((component) => component.enabled)
      .reduce((sum, component) => sum.plus(component.weight), new Decimal(0));
    if (!total.eq(100)) {
      throw new BadRequestException(
        `Enabled scorecard component weights must total 100. Current total: ${total.toString()}.`,
      );
    }
  }

  private validateDateRange(from?: string, to?: string) {
    if (from && to && to < from) {
      throw new BadRequestException(
        'effective_to must not be earlier than effective_from.',
      );
    }
  }

  private componentSource(
    component: PerformanceScorecardComponent,
    rawScore: Decimal | null,
  ) {
    return {
      component_configuration: component.configuration ?? null,
      raw_score_available: rawScore !== null,
    };
  }

  private configSnapshot(config: PerformanceScorecardConfig) {
    return {
      id: config.id,
      code: config.code,
      name: config.name,
      is_default: config.isDefault,
      effective_from: config.effectiveFrom,
      effective_to: config.effectiveTo,
      components: config.components,
      version: config.version,
    };
  }
}
