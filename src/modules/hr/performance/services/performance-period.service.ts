import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IsNull, Not, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformancePeriodStatusEnum } from '../enums/performance-period-status.enum';
import { PerformanceFinancialYear } from '../entities/performance-financial-year.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformancePeriodFactory } from '../utils/performance-period-factory';
import {
  CreatePerformancePeriodDto,
  PerformancePeriodQueryDto,
  ReopenPerformancePeriodDto,
  UpdatePerformancePeriodDto,
} from '../dto/performance-period.dto';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { NotificationsService } from '../../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import {
  KPI_DOMAIN_EVENTS,
  type KpiCycleEvent,
} from '../events/kpi-domain-events';
import { kpiCycleToday } from '../utils/kpi-cycle-date';

@Injectable()
export class PerformancePeriodService {
  private readonly logger = new Logger(PerformancePeriodService.name);
  private readonly periodFactory = new PerformancePeriodFactory();

  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(PerformanceFinancialYear)
    private readonly financialYearRepository: Repository<PerformanceFinancialYear>,
    @InjectRepository(PerformancePeriod)
    private readonly periodRepository: Repository<PerformancePeriod>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: PerformancePeriodQueryDto = {},
  ): Promise<PerformancePeriod[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const qb = this.periodRepository
      .createQueryBuilder('period')
      .where('period.companyId = :companyId', { companyId });

    if (query.status) {
      qb.andWhere('period.status = :status', { status: query.status });
    }
    if (query.date_from) {
      qb.andWhere('period.endDate >= :dateFrom', { dateFrom: query.date_from });
    }
    if (query.date_to) {
      qb.andWhere('period.startDate <= :dateTo', { dateTo: query.date_to });
    }
    if (query.created_by_company_user_id) {
      qb.andWhere('period.createdByCompanyUserId = :creatorId', {
        creatorId: query.created_by_company_user_id,
      });
    }

    return qb
      .orderBy('period.startDate', 'DESC')
      .addOrderBy('period.sequenceNumber', 'DESC')
      .getMany();
  }

  async get(actor: AuthenticatedUser, id: number): Promise<PerformancePeriod> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const period = await this.periodRepository.findOne({
      where: { id, companyId },
    });
    if (!period) {
      throw new NotFoundException('Performance period not found.');
    }
    return period;
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreatePerformancePeriodDto,
  ): Promise<PerformancePeriod> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    this.validateDateRange(dto.start_date, dto.end_date);
    this.validateKpiCycleDates(
      dto.start_date,
      dto.end_date,
      dto.goal_setting_deadline,
      dto.mid_cycle_review_date,
      dto.final_review_deadline,
    );
    this.validateRatingBands(dto.rating_bands, dto.score_cap ?? 120);
    const financialYear = await this.financialYearRepository.findOne({
      where: { id: dto.financial_year_id, companyId },
    });
    if (!financialYear) {
      throw new NotFoundException('Performance financial year not found.');
    }
    if (financialYear.isLocked) {
      throw new ConflictException('The performance financial year is locked.');
    }
    if (
      dto.start_date < financialYear.startDate ||
      dto.end_date > financialYear.endDate
    ) {
      throw new BadRequestException(
        'Performance period dates must fall within the financial year.',
      );
    }
    await this.assertParallelAllowed(
      companyId,
      dto.start_date,
      dto.end_date,
      dto.allow_parallel ?? true,
    );

    const draftPeriod = this.periodRepository.create({
      companyId,
      financialYearId: financialYear.id,
      periodType: dto.period_type,
      sequenceNumber: dto.sequence_number,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? null,
      createdByCompanyUserId: actor.companyMembershipId ?? null,
      startDate: dto.start_date,
      endDate: dto.end_date,
      kpiPhase: dto.goal_setting_deadline ? 'DRAFT' : null,
      goalSettingDeadline: dto.goal_setting_deadline ?? null,
      midCycleReviewDate: dto.mid_cycle_review_date ?? null,
      finalReviewDeadline: dto.final_review_deadline ?? null,
      allowParallel: dto.allow_parallel ?? true,
      maxWeightage: String(dto.max_weightage ?? 100),
      scoreCap: String(dto.score_cap ?? 120),
      coolingPeriodDays: dto.cooling_period_days ?? 0,
      kpiRatingBands: dto.rating_bands ?? null,
      status: PerformancePeriodStatusEnum.DRAFT,
      achievementEntryOpensAt: null,
      achievementEntryClosesAt: null,
      selfReviewDueAt: null,
      managerReviewDueAt: null,
      hrReviewDueAt: null,
      generationSnapshot: { manually_created: true },
    });
    this.initializeKpiPhase(draftPeriod);
    const period = await this.periodRepository.save(draftPeriod);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIOD_CREATED,
      actor,
      afterValues: this.periodAuditSnapshot(period),
    });
    return period;
  }

  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdatePerformancePeriodDto,
  ): Promise<PerformancePeriod> {
    const period = await this.get(actor, id);
    if (period.status !== PerformancePeriodStatusEnum.DRAFT) {
      throw new ConflictException(
        'Only draft performance periods can be edited.',
      );
    }
    const startDate = dto.start_date ?? period.startDate;
    const endDate = dto.end_date ?? period.endDate;
    this.validateDateRange(startDate, endDate);
    this.validateKpiCycleDates(
      startDate,
      endDate,
      dto.goal_setting_deadline ?? period.goalSettingDeadline ?? undefined,
      dto.mid_cycle_review_date ?? period.midCycleReviewDate ?? undefined,
      dto.final_review_deadline ?? period.finalReviewDeadline ?? undefined,
    );
    this.validateRatingBands(
      dto.rating_bands ?? period.kpiRatingBands ?? undefined,
      dto.score_cap ?? Number(period.scoreCap),
    );
    const financialYearId = dto.financial_year_id ?? period.financialYearId;
    const financialYear = await this.financialYearRepository.findOne({
      where: { id: financialYearId, companyId: period.companyId },
    });
    if (!financialYear) {
      throw new NotFoundException('Performance financial year not found.');
    }
    if (
      startDate < financialYear.startDate ||
      endDate > financialYear.endDate
    ) {
      throw new BadRequestException(
        'Performance period dates must fall within the financial year.',
      );
    }
    await this.assertParallelAllowed(
      period.companyId,
      startDate,
      endDate,
      dto.allow_parallel ?? period.allowParallel,
      period.id,
    );
    const before = this.periodAuditSnapshot(period);
    period.financialYearId = financialYearId;
    period.periodType = dto.period_type ?? period.periodType;
    period.sequenceNumber = dto.sequence_number ?? period.sequenceNumber;
    period.name = dto.name?.trim() ?? period.name;
    period.description =
      dto.description === undefined
        ? period.description
        : dto.description.trim() || null;
    period.startDate = startDate;
    period.endDate = endDate;
    if (dto.goal_setting_deadline !== undefined)
      period.goalSettingDeadline = dto.goal_setting_deadline;
    if (dto.mid_cycle_review_date !== undefined)
      period.midCycleReviewDate = dto.mid_cycle_review_date;
    if (dto.final_review_deadline !== undefined)
      period.finalReviewDeadline = dto.final_review_deadline;
    if (dto.goal_setting_deadline !== undefined) period.kpiPhase = 'DRAFT';
    if (dto.allow_parallel !== undefined)
      period.allowParallel = dto.allow_parallel;
    if (dto.max_weightage !== undefined)
      period.maxWeightage = String(dto.max_weightage);
    if (dto.score_cap !== undefined) period.scoreCap = String(dto.score_cap);
    if (dto.cooling_period_days !== undefined)
      period.coolingPeriodDays = dto.cooling_period_days;
    if (dto.rating_bands !== undefined)
      period.kpiRatingBands = dto.rating_bands;
    this.initializeKpiPhase(period);
    const saved = await this.periodRepository.save(period);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIOD_UPDATED,
      actor,
      beforeValues: before,
      afterValues: this.periodAuditSnapshot(saved),
    });
    return saved;
  }

  async activate(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<PerformancePeriod> {
    const period = await this.get(actor, id);
    if (period.status !== PerformancePeriodStatusEnum.DRAFT) {
      throw new ConflictException('Only a draft period can be activated.');
    }
    period.status = PerformancePeriodStatusEnum.OPEN;
    if (period.kpiPhase)
      period.kpiPhase = this.desiredKpiPhase(period, new Date());
    if (period.kpiPhase === 'LOCKED' || period.kpiPhase === 'CLOSED') {
      period.status = PerformancePeriodStatusEnum.LOCKED;
      period.lockedAt = new Date();
    }
    period.achievementEntryOpensAt ??= new Date();
    const saved = await this.periodRepository.save(period);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIOD_ACTIVATED,
      actor,
      afterValues: this.periodAuditSnapshot(saved),
    });
    void this.notifyPeriodActivated(saved, actor);
    return saved;
  }

  async close(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<PerformancePeriod> {
    const period = await this.get(actor, id);
    if (period.status === PerformancePeriodStatusEnum.DRAFT) {
      throw new ConflictException(
        'A draft performance period must be activated before it can be closed.',
      );
    }
    if (
      [
        PerformancePeriodStatusEnum.LOCKED,
        PerformancePeriodStatusEnum.CANCELLED,
      ].includes(period.status)
    ) {
      throw new ConflictException('The performance period is already closed.');
    }
    const before = this.periodAuditSnapshot(period);
    period.status = PerformancePeriodStatusEnum.LOCKED;
    if (period.kpiPhase) period.kpiPhase = 'LOCKED';
    period.lockedAt = new Date();
    const saved = await this.periodRepository.save(period);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIOD_CLOSED,
      actor,
      beforeValues: before,
      afterValues: this.periodAuditSnapshot(saved),
    });
    if (saved.kpiPhase === 'LOCKED')
      this.emitCycleEvent(KPI_DOMAIN_EVENTS.CYCLE_LOCKED, saved);
    return saved;
  }

  async reopen(
    actor: AuthenticatedUser,
    id: number,
    dto: ReopenPerformancePeriodDto,
  ) {
    const reason = dto.reason?.trim();
    if (!reason)
      throw new BadRequestException('A reason is required to reopen a cycle.');
    const period = await this.get(actor, id);
    if (!period.kpiPhase || !['LOCKED', 'CLOSED'].includes(period.kpiPhase)) {
      throw new ConflictException('Only a locked KPI cycle can be reopened.');
    }
    const before = this.periodAuditSnapshot(period);
    period.kpiPhase = 'REOPENED';
    period.kpiReopenReason = reason;
    period.status = PerformancePeriodStatusEnum.OPEN;
    period.lockedAt = null;
    const saved = await this.periodRepository.save(period);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIOD_REOPENED,
      actor,
      reason,
      beforeValues: before,
      afterValues: this.periodAuditSnapshot(saved),
    });
    this.emitCycleEvent(KPI_DOMAIN_EVENTS.CYCLE_REOPENED, saved);
    return saved;
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: 'Africa/Dar_es_Salaam' })
  async advanceKpiCycles(): Promise<void> {
    const periods = await this.periodRepository.find({
      where: { kpiPhase: Not(IsNull()) },
    });
    const now = new Date();
    for (const period of periods) {
      if (
        period.kpiPhase === 'REOPENED' ||
        period.status === PerformancePeriodStatusEnum.CANCELLED
      )
        continue;
      const computedPhase = this.desiredKpiPhase(period, now);
      const nextPhase =
        computedPhase === 'CLOSED' && period.kpiPhase !== 'LOCKED'
          ? 'LOCKED'
          : period.kpiPhase === 'LOCKED' && computedPhase !== 'CLOSED'
            ? 'LOCKED'
            : computedPhase;
      if (nextPhase === period.kpiPhase) continue;
      const before = this.periodAuditSnapshot(period);
      period.kpiPhase = nextPhase;
      if (nextPhase === 'LOCKED' || nextPhase === 'CLOSED') {
        period.status = PerformancePeriodStatusEnum.LOCKED;
        period.lockedAt ??= now;
      } else if (
        period.status === PerformancePeriodStatusEnum.DRAFT &&
        nextPhase !== 'DRAFT'
      ) {
        period.status = PerformancePeriodStatusEnum.OPEN;
      }
      const saved = await this.periodRepository.save(period);
      await this.auditService.log({
        action: PerformanceAuditActionEnum.PERIOD_KPI_PHASE_CHANGED,
        actor: {
          id: 0,
          email: 'system',
          scope: 'company',
          userType: 'COMPANY_USER',
          companyId: period.companyId,
          roles: ['SYSTEM'],
          permissions: [],
        },
        beforeValues: before,
        afterValues: this.periodAuditSnapshot(saved),
      });
      if (nextPhase === 'LOCKED')
        this.emitCycleEvent(KPI_DOMAIN_EVENTS.CYCLE_LOCKED, saved);
    }
  }

  private emitCycleEvent(eventName: string, period: PerformancePeriod): void {
    const payload: KpiCycleEvent = {
      cycleId: period.id,
      companyId: period.companyId,
      occurredAt: new Date().toISOString(),
    };
    this.eventEmitter.emit(eventName, payload);
  }

  async generatePeriods(
    financialYearId: number,
    actor: AuthenticatedUser,
  ): Promise<PerformancePeriod[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const financialYear = await this.financialYearRepository.findOne({
      where: { id: financialYearId, companyId },
    });

    if (!financialYear) {
      throw new NotFoundException('Performance financial year not found.');
    }

    if (financialYear.isLocked) {
      throw new ConflictException(
        'Locked financial years cannot be regenerated.',
      );
    }

    const monthlyPeriods = this.periodFactory.buildMonthlyPeriods(
      financialYear.startDate,
      financialYear.endDate,
    );
    const quarterlyPeriods =
      this.periodFactory.buildQuarterlyPeriods(monthlyPeriods);
    const periodTemplates = [...monthlyPeriods, ...quarterlyPeriods];

    const existing = await this.periodRepository.find({
      where: { financialYearId },
    });
    const existingKeys = new Set(
      existing.map((period) => `${period.periodType}:${period.sequenceNumber}`),
    );

    const selfReviewDays = this.configService.get<number>(
      'PERFORMANCE_DEFAULT_SELF_REVIEW_DAYS',
      3,
    );
    const managerReviewDays = this.configService.get<number>(
      'PERFORMANCE_DEFAULT_MANAGER_REVIEW_DAYS',
      5,
    );
    const hrReviewDays = this.configService.get<number>(
      'PERFORMANCE_DEFAULT_HR_REVIEW_DAYS',
      3,
    );

    const created = await this.periodRepository.save(
      periodTemplates
        .filter(
          (period) =>
            !existingKeys.has(`${period.periodType}:${period.sequenceNumber}`),
        )
        .map((period) => {
          const end = new Date(`${period.endDate}T00:00:00.000Z`);
          const openAt = new Date(end);
          openAt.setUTCDate(openAt.getUTCDate() + 1);

          const selfReviewDueAt = new Date(openAt);
          selfReviewDueAt.setUTCDate(
            selfReviewDueAt.getUTCDate() + selfReviewDays,
          );

          const managerReviewDueAt = new Date(selfReviewDueAt);
          managerReviewDueAt.setUTCDate(
            managerReviewDueAt.getUTCDate() + managerReviewDays,
          );

          const hrReviewDueAt = new Date(managerReviewDueAt);
          hrReviewDueAt.setUTCDate(hrReviewDueAt.getUTCDate() + hrReviewDays);

          return this.periodRepository.create({
            companyId,
            financialYearId,
            periodType: period.periodType,
            sequenceNumber: period.sequenceNumber,
            name: period.name,
            description: null,
            createdByCompanyUserId: actor.companyMembershipId ?? null,
            startDate: period.startDate,
            endDate: period.endDate,
            status: PerformancePeriodStatusEnum.DRAFT,
            achievementEntryOpensAt: openAt,
            achievementEntryClosesAt: selfReviewDueAt,
            selfReviewDueAt,
            managerReviewDueAt,
            hrReviewDueAt,
            generationSnapshot: period.generationSnapshot,
          });
        }),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.PERIODS_GENERATED,
      actor,
      afterValues: {
        financial_year_id: financialYearId,
        created_periods: created.map((period) => ({
          id: period.id,
          period_type: period.periodType,
          sequence_number: period.sequenceNumber,
        })),
      },
    });

    return this.periodRepository.find({
      where: { financialYearId },
      order: { startDate: 'ASC', sequenceNumber: 'ASC' },
    });
  }

  private validateDateRange(startDate: string, endDate: string): void {
    if (endDate < startDate) {
      throw new BadRequestException('end_date must be on or after start_date.');
    }
  }

  private initializeKpiPhase(period: PerformancePeriod): void {
    if (!period.kpiPhase) return;
    const phase = this.desiredKpiPhase(period, new Date());
    period.kpiPhase = phase;
    if (phase === 'LOCKED' || phase === 'CLOSED') {
      period.status = PerformancePeriodStatusEnum.LOCKED;
      period.lockedAt = new Date();
    } else if (phase !== 'DRAFT') {
      period.status = PerformancePeriodStatusEnum.OPEN;
    }
  }

  private async assertParallelAllowed(
    companyId: number,
    startDate: string,
    endDate: string,
    allowParallel: boolean,
    excludeId?: number,
  ): Promise<void> {
    const qb = this.periodRepository
      .createQueryBuilder('period')
      .where('period.companyId = :companyId', { companyId })
      .andWhere('period.startDate <= :endDate', { endDate })
      .andWhere('period.endDate >= :startDate', { startDate })
      .andWhere('period.status != :cancelled', {
        cancelled: PerformancePeriodStatusEnum.CANCELLED,
      });
    if (excludeId) qb.andWhere('period.id != :excludeId', { excludeId });
    const overlapping = await qb.getMany();
    if (overlapping.some((period) => !allowParallel || !period.allowParallel)) {
      throw new ConflictException(
        'This cycle overlaps another period that does not allow parallel cycles.',
      );
    }
  }

  private validateKpiCycleDates(
    startDate: string,
    endDate: string,
    goalDeadline?: string,
    midReviewDate?: string,
    finalDeadline?: string,
  ): void {
    const count = [goalDeadline, midReviewDate, finalDeadline].filter(
      Boolean,
    ).length;
    if (count !== 0 && count !== 3) {
      throw new BadRequestException(
        'Goal-setting, mid-cycle, and final-review dates must be configured together.',
      );
    }
    if (!count) return;
    if (
      startDate > goalDeadline! ||
      goalDeadline! >= midReviewDate! ||
      midReviewDate! > endDate ||
      finalDeadline! < endDate
    ) {
      throw new BadRequestException(
        'KPI cycle dates must follow start, goal-setting deadline, mid-cycle review, end, and final-review deadline.',
      );
    }
  }

  private validateRatingBands(
    bands: Array<{ label: string; min: number }> | undefined,
    scoreCap: number,
  ): void {
    if (!bands) return;
    if (
      !bands.length ||
      bands.some(
        (band) =>
          !band ||
          typeof band.label !== 'string' ||
          !band.label.trim() ||
          !Number.isFinite(band.min) ||
          band.min < 0 ||
          band.min > scoreCap,
      )
    ) {
      throw new BadRequestException(
        'Rating bands need a label and a minimum score within the cycle score cap.',
      );
    }
    if (new Set(bands.map((band) => band.min)).size !== bands.length) {
      throw new BadRequestException(
        'Rating band minimum scores must be unique.',
      );
    }
  }

  private desiredKpiPhase(period: PerformancePeriod, now: Date): string {
    if (
      !period.goalSettingDeadline ||
      !period.midCycleReviewDate ||
      !period.finalReviewDeadline
    ) {
      return period.kpiPhase ?? 'DRAFT';
    }
    const today = kpiCycleToday(now);
    if (today < period.startDate) return 'DRAFT';
    if (today <= period.goalSettingDeadline) return 'GOAL_SETTING';
    if (today === period.midCycleReviewDate) return 'MID_REVIEW';
    if (today <= period.endDate) return 'IN_PROGRESS';
    if (today <= period.finalReviewDeadline) return 'FINAL_REVIEW';
    const closeDate = new Date(`${period.finalReviewDeadline}T00:00:00.000Z`);
    closeDate.setUTCDate(closeDate.getUTCDate() + period.coolingPeriodDays + 1);
    return today >= closeDate.toISOString().slice(0, 10) ? 'CLOSED' : 'LOCKED';
  }

  private periodAuditSnapshot(period: PerformancePeriod) {
    return {
      id: period.id,
      financial_year_id: period.financialYearId,
      name: period.name,
      start_date: period.startDate,
      end_date: period.endDate,
      status: period.status,
      kpi_phase: period.kpiPhase,
      kpi_reopen_reason: period.kpiReopenReason,
      goal_setting_deadline: period.goalSettingDeadline,
      mid_cycle_review_date: period.midCycleReviewDate,
      final_review_deadline: period.finalReviewDeadline,
      max_weightage: period.maxWeightage,
      score_cap: period.scoreCap,
      allow_parallel: period.allowParallel,
      cooling_period_days: period.coolingPeriodDays,
      rating_bands: period.kpiRatingBands,
      version: period.version,
    };
  }

  private async notifyPeriodActivated(
    period: PerformancePeriod,
    actor: AuthenticatedUser,
  ): Promise<void> {
    try {
      const employees = await this.employeeRepository.find({
        where: {
          company_id: period.companyId,
          employment_status: EmploymentStatusEnum.ACTIVE,
        },
        select: ['id', 'company_user_id'],
      });
      await this.notificationsService.createAndPushMany(
        employees
          .filter((employee) => employee.company_user_id != null)
          .map((employee) => ({
            company_id: period.companyId,
            sender_company_user_id: actor.companyMembershipId ?? null,
            receiver_company_user_id: employee.company_user_id!,
            category: NotificationCategoryEnum.HR,
            priority: NotificationPriorityEnum.MEDIUM,
            title: 'Performance period opened',
            message: `${period.name} is now open for KPI proposals.`,
            related_module: 'PERFORMANCE',
            entity_type: 'PERFORMANCE_PERIOD',
            entity_id: period.id,
            action_url: '/dashboard/me/performance/kpis',
            dedupe_key: `performance-period-open:${period.id}:${employee.id}`,
          })),
      );
    } catch (error) {
      this.logger.warn(
        `Performance period ${period.id} was activated, but notifications failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
