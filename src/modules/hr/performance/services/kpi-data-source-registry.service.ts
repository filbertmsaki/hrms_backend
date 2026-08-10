import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { LeaveRequest } from '../../leave/entities/leave-request.entity';
import { LeaveStatusEnum } from '../../leave/enums/leave-status.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import { WorkActivityKpiProviderService } from '../../work-activities/services/work-activity-kpi-provider.service';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { KpiAchievementStatusEnum } from '../enums/kpi-achievement-status.enum';
import { KpiDataSourceTypeEnum } from '../enums/kpi-data-source-type.enum';
import { KpiProviderKeyEnum } from '../enums/kpi-provider-key.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceScoringService } from './performance-scoring.service';

@Injectable()
export class KpiDataSourceRegistryService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly scoringService: PerformanceScoringService,
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(PerformancePeriod)
    private readonly periodRepository: Repository<PerformancePeriod>,
    @InjectRepository(KpiAchievement)
    private readonly achievementRepository: Repository<KpiAchievement>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    private readonly workActivityKpiProviderService: WorkActivityKpiProviderService,
  ) {}

  async syncPeriod(
    actor: AuthenticatedUser,
    performancePeriodId: number,
    providerKey?: string,
  ): Promise<KpiAchievement[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const period = await this.periodRepository.findOne({
      where: { id: performancePeriodId, companyId },
    });

    if (!period) {
      throw new NotFoundException('Performance period not found.');
    }

    const achievements = await this.achievementRepository.find({
      where: { companyId },
      relations: {
        planItem: {
          kpiDefinitionVersion: true,
        },
        periodAssignment: {
          performancePeriod: true,
        },
      },
    });

    const candidates = achievements.filter(
      (achievement) =>
        achievement.periodAssignment.performancePeriodId ===
          performancePeriodId &&
        [
          KpiDataSourceTypeEnum.ATTENDANCE,
          KpiDataSourceTypeEnum.LEAVE,
          KpiDataSourceTypeEnum.DAILY_ACTIVITY,
          KpiDataSourceTypeEnum.FIELD_VISIT,
        ].includes(achievement.sourceType),
    );

    const updated: KpiAchievement[] = [];

    for (const achievement of candidates) {
      const resolvedProviderKey = this.resolveProviderKey(achievement);
      if (providerKey && providerKey !== String(resolvedProviderKey)) {
        continue;
      }

      const achievementValue = await this.computeValue(
        resolvedProviderKey,
        companyId,
        achievement.employeeId,
        period.startDate,
        period.endDate,
      );
      const score = this.scoringService.score({
        formula: achievement.planItem.kpiDefinitionVersion.scoringFormula,
        targetValue:
          achievement.targetValue ??
          achievement.planItem.kpiDefinitionVersion.defaultTargetValue,
        achievementValue,
        weight: achievement.planItem.weight,
        formulaConfiguration:
          achievement.planItem.kpiDefinitionVersion.formulaConfiguration,
      });

      achievement.achievementValue = String(achievementValue);
      achievement.rawScore = score.rawScore;
      achievement.cappedScore = score.cappedScore;
      achievement.weightedScore = score.weightedScore;
      achievement.status = KpiAchievementStatusEnum.SYSTEM_CALCULATED;
      achievement.achievementSnapshot = {
        ...(achievement.achievementSnapshot ?? {}),
        provider_key: resolvedProviderKey,
        source_period: {
          start_date: period.startDate,
          end_date: period.endDate,
        },
      };

      const saved = await this.achievementRepository.save(achievement);
      await this.auditService.log({
        action: PerformanceAuditActionEnum.ACHIEVEMENT_SYSTEM_CALCULATED,
        actor,
        employeeId: saved.employeeId,
        kpiAchievementId: saved.id,
        afterValues: {
          achievement_value: saved.achievementValue,
          weighted_score: saved.weightedScore,
          provider_key: resolvedProviderKey,
        },
      });
      updated.push(saved);
    }

    return updated;
  }

  private resolveProviderKey(achievement: KpiAchievement): KpiProviderKeyEnum {
    const providerKey =
      achievement.planItem.kpiDefinitionVersion.dataSourceConfiguration?.[
        'provider_key'
      ];

    if (typeof providerKey === 'string') {
      return providerKey as KpiProviderKeyEnum;
    }

    switch (achievement.sourceType) {
      case KpiDataSourceTypeEnum.ATTENDANCE:
        return KpiProviderKeyEnum.ATTENDANCE_PRESENT_RATE;
      case KpiDataSourceTypeEnum.LEAVE:
        return KpiProviderKeyEnum.LEAVE_APPROVED_DAYS;
      default:
        throw new BadRequestException(
          'System KPI is missing a supported provider configuration.',
        );
    }
  }

  private async computeValue(
    providerKey: KpiProviderKeyEnum,
    companyId: number,
    employeeId: number,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    switch (providerKey) {
      case KpiProviderKeyEnum.ATTENDANCE_PRESENT_RATE:
        return this.calculateAttendancePresentRate(
          companyId,
          employeeId,
          startDate,
          endDate,
        );
      case KpiProviderKeyEnum.ATTENDANCE_LATE_OCCURRENCE:
        return this.calculateAttendanceLateOccurrences(
          companyId,
          employeeId,
          startDate,
          endDate,
        );
      case KpiProviderKeyEnum.LEAVE_APPROVED_DAYS:
        return this.calculateApprovedLeaveDays(
          companyId,
          employeeId,
          startDate,
          endDate,
        );
      case KpiProviderKeyEnum.PHASE13_DAILY_ACTIVITY:
      case KpiProviderKeyEnum.PHASE13_FIELD_VISIT:
        if (
          !this.configService.get<boolean>(
            providerKey === KpiProviderKeyEnum.PHASE13_FIELD_VISIT
              ? 'PERFORMANCE_FIELD_VISIT_PROVIDER_ENABLED'
              : 'PERFORMANCE_ACTIVITY_PROVIDER_ENABLED',
            false,
          )
        ) {
          throw new BadRequestException(
            providerKey === KpiProviderKeyEnum.PHASE13_FIELD_VISIT
              ? 'Field-visit KPI provider is unavailable until Phase 13 is enabled.'
              : 'Daily activity KPI provider is unavailable until Phase 13 is enabled.',
          );
        }
        return 0;
      case KpiProviderKeyEnum.ACTIVITY_SUBMISSION_DISCIPLINE:
      case KpiProviderKeyEnum.ACTIVITY_COMPLETION_RATE:
      case KpiProviderKeyEnum.ACTIVITY_PLAN_VS_COMPLETION:
      case KpiProviderKeyEnum.ACTIVITY_MANAGER_APPROVAL_RATE:
      case KpiProviderKeyEnum.ACTIVITY_ON_TIME_SUBMISSION_RATE:
        this.assertPhase13ProviderEnabled(
          'PERFORMANCE_ACTIVITY_PROVIDER_ENABLED',
          'Daily activity KPI provider is unavailable until Phase 13 is enabled.',
        );
        return this.workActivityKpiProviderService.getMetric(
          companyId,
          employeeId,
          startDate,
          endDate,
          providerKey,
        );
      case KpiProviderKeyEnum.FIELD_VISITS_PLANNED:
      case KpiProviderKeyEnum.FIELD_VISITS_COMPLETED:
      case KpiProviderKeyEnum.FIELD_VISIT_COMPLETION_RATE:
      case KpiProviderKeyEnum.CUSTOMER_VISITS_COMPLETED:
      case KpiProviderKeyEnum.BROKER_VISITS_COMPLETED:
      case KpiProviderKeyEnum.UNPLANNED_VISIT_RATE:
      case KpiProviderKeyEnum.VISIT_MANAGER_APPROVAL_RATE:
      case KpiProviderKeyEnum.LEADS_GENERATED:
      case KpiProviderKeyEnum.QUOTATIONS_REPORTED:
      case KpiProviderKeyEnum.BUSINESS_REPORTED_CLOSED:
      case KpiProviderKeyEnum.POTENTIAL_VALUE_REPORTED:
      case KpiProviderKeyEnum.ACTUAL_VALUE_VALIDATED:
      case KpiProviderKeyEnum.RENEWAL_FOLLOWUPS_COMPLETED:
      case KpiProviderKeyEnum.COLLECTION_FOLLOWUPS_COMPLETED:
      case KpiProviderKeyEnum.FOLLOWUP_COMPLETION_RATE:
        this.assertPhase13ProviderEnabled(
          'PERFORMANCE_FIELD_VISIT_PROVIDER_ENABLED',
          'Field-visit KPI provider is unavailable until Phase 13 is enabled.',
        );
        return this.workActivityKpiProviderService.getMetric(
          companyId,
          employeeId,
          startDate,
          endDate,
          providerKey,
        );
      default:
        break;
    }

    throw new BadRequestException('Unsupported KPI data-source provider.');
  }

  private assertPhase13ProviderEnabled(key: string, message: string) {
    if (!this.configService.get<boolean>(key, false)) {
      throw new BadRequestException(message);
    }
  }

  private async calculateAttendancePresentRate(
    companyId: number,
    employeeId: number,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const totals = await this.attendanceRepository
      .createQueryBuilder('summary')
      .select('COUNT(*)', 'total_days')
      .addSelect(
        `SUM(CASE WHEN summary.attendanceStatus = 'PRESENT' THEN 1 ELSE 0 END)`,
        'present_days',
      )
      .where('summary.companyId = :companyId', { companyId })
      .andWhere('summary.employeeId = :employeeId', { employeeId })
      .andWhere('summary.attendanceDate >= :startDate', { startDate })
      .andWhere('summary.attendanceDate <= :endDate', { endDate })
      .getRawOne<{ total_days: string; present_days: string }>();

    const totalDays = Number(totals?.total_days ?? 0);
    const presentDays = Number(totals?.present_days ?? 0);

    if (totalDays === 0) {
      return 0;
    }

    return Number(((presentDays / totalDays) * 100).toFixed(4));
  }

  private async calculateAttendanceLateOccurrences(
    companyId: number,
    employeeId: number,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const totals = await this.attendanceRepository
      .createQueryBuilder('summary')
      .select(
        `SUM(CASE WHEN summary.lateMinutes > 0 THEN 1 ELSE 0 END)`,
        'late_days',
      )
      .where('summary.companyId = :companyId', { companyId })
      .andWhere('summary.employeeId = :employeeId', { employeeId })
      .andWhere('summary.attendanceDate >= :startDate', { startDate })
      .andWhere('summary.attendanceDate <= :endDate', { endDate })
      .getRawOne<{ late_days: string | null }>();

    return Number(Number(totals?.late_days ?? 0).toFixed(4));
  }

  private async calculateApprovedLeaveDays(
    companyId: number,
    employeeId: number,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const totals = await this.leaveRequestRepository
      .createQueryBuilder('leaveRequest')
      .select('COALESCE(SUM(leaveRequest.total_days), 0)', 'leave_days')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.employee_id = :employeeId', { employeeId })
      .andWhere('leaveRequest.status = :status', {
        status: LeaveStatusEnum.APPROVED,
      })
      .andWhere('leaveRequest.start_date <= :endDate', { endDate })
      .andWhere('leaveRequest.end_date >= :startDate', { startDate })
      .getRawOne<{ leave_days: string | null }>();

    return Number(Number(totals?.leave_days ?? 0).toFixed(4));
  }
}
