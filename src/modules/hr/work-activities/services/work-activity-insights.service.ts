import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { WorkActivityException } from '../entities/analytics.entities';
import { DailyActivityReport } from '../entities/daily-activity.entities';
import {
  FieldFollowUp,
  FieldOpportunity,
  FieldVisit,
} from '../entities/field-visit.entities';
import {
  DailyActivityReportStatusEnum,
  FieldFollowUpStatusEnum,
  FieldVisitStatusEnum,
} from '../enums/work-activity.enums';
import { WorkActivityKpiProviderService } from './work-activity-kpi-provider.service';

@Injectable()
export class WorkActivityInsightsService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly kpiProviderService: WorkActivityKpiProviderService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(DailyActivityReport)
    private readonly reportRepository: Repository<DailyActivityReport>,
    @InjectRepository(FieldVisit)
    private readonly visitRepository: Repository<FieldVisit>,
    @InjectRepository(FieldOpportunity)
    private readonly opportunityRepository: Repository<FieldOpportunity>,
    @InjectRepository(FieldFollowUp)
    private readonly followUpRepository: Repository<FieldFollowUp>,
    @InjectRepository(WorkActivityException)
    private readonly exceptionRepository: Repository<WorkActivityException>,
  ) {}

  private async resolveScopedEmployeeIds(actor: AuthenticatedUser) {
    return this.hrAccessService.getAccessibleEmployeeIds(actor);
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private monthStart(date: string) {
    return `${date.slice(0, 7)}-01`;
  }

  async getEmployeeSummary(actor: AuthenticatedUser) {
    if (!actor.companyId || !actor.employeeId) {
      return {
        reports_submitted: 0,
        approved_reports: 0,
        reviewed_visits: 0,
        open_follow_ups: 0,
        open_exceptions: 0,
      };
    }

    const today = this.today();
    const dateFrom = this.monthStart(today);
    const [
      reportsSubmitted,
      approvedReports,
      reviewedVisits,
      openFollowUps,
      openExceptions,
    ] = await Promise.all([
      this.reportRepository.count({
        where: {
          companyId: actor.companyId,
          employeeId: actor.employeeId,
        },
      }),
      this.reportRepository.count({
        where: {
          companyId: actor.companyId,
          employeeId: actor.employeeId,
          status: DailyActivityReportStatusEnum.APPROVED,
        },
      }),
      this.visitRepository.count({
        where: {
          companyId: actor.companyId,
          employeeId: actor.employeeId,
          status: FieldVisitStatusEnum.REVIEWED,
        },
      }),
      this.followUpRepository.count({
        where: {
          companyId: actor.companyId,
          assignedToEmployeeId: actor.employeeId,
          status: FieldFollowUpStatusEnum.OPEN,
        },
      }),
      this.exceptionRepository.count({
        where: {
          companyId: actor.companyId,
          employeeId: actor.employeeId,
          status: 'OPEN' as never,
        },
      }),
    ]);

    return {
      reports_submitted: reportsSubmitted,
      approved_reports: approvedReports,
      reviewed_visits: reviewedVisits,
      open_follow_ups: openFollowUps,
      open_exceptions: openExceptions,
      current_month: {
        date_from: dateFrom,
        date_to: today,
        activity_completion_rate: await this.kpiProviderService.getMetric(
          actor.companyId,
          actor.employeeId,
          dateFrom,
          today,
          'ACTIVITY_COMPLETION_RATE',
        ),
        visit_completion_rate: await this.kpiProviderService.getMetric(
          actor.companyId,
          actor.employeeId,
          dateFrom,
          today,
          'FIELD_VISIT_COMPLETION_RATE',
        ),
      },
    };
  }

  async getManagerSummary(
    actor: AuthenticatedUser,
    dateFrom?: string,
    dateTo?: string,
  ) {
    if (!actor.companyId) {
      return {
        pending_activity_reviews: 0,
        pending_visit_reviews: 0,
        approved_reports: 0,
        reviewed_visits: 0,
      };
    }

    const scopedEmployeeIds = await this.resolveScopedEmployeeIds(actor);
    if (scopedEmployeeIds !== null && scopedEmployeeIds.length === 0) {
      return {
        pending_activity_reviews: 0,
        pending_visit_reviews: 0,
        approved_reports: 0,
        reviewed_visits: 0,
      };
    }

    const employeeIds =
      scopedEmployeeIds ??
      (
        await this.employeeRepository
          .createQueryBuilder('employee')
          .where('employee.company_id = :companyId', {
            companyId: actor.companyId,
          })
          .select('employee.id', 'id')
          .getRawMany<{ id: number }>()
      ).map((row) => Number(row.id));

    if (employeeIds.length === 0) {
      return {
        pending_activity_reviews: 0,
        pending_visit_reviews: 0,
        approved_reports: 0,
        reviewed_visits: 0,
      };
    }

    const reportWhere = {
      companyId: actor.companyId,
      employeeId: In(employeeIds),
    };
    const visitWhere = {
      companyId: actor.companyId,
      employeeId: In(employeeIds),
    };

    const [
      pendingActivityReviews,
      pendingVisitReviews,
      approvedReports,
      reviewedVisits,
    ] = await Promise.all([
      this.reportRepository.count({
        where: {
          ...reportWhere,
          status: DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING,
        },
      }),
      this.visitRepository.count({
        where: {
          ...visitWhere,
          status: FieldVisitStatusEnum.MANAGER_REVIEW_PENDING,
        },
      }),
      this.reportRepository.count({
        where: {
          ...reportWhere,
          status: DailyActivityReportStatusEnum.APPROVED,
        },
      }),
      this.visitRepository.count({
        where: { ...visitWhere, status: FieldVisitStatusEnum.REVIEWED },
      }),
    ]);

    return {
      pending_activity_reviews: pendingActivityReviews,
      pending_visit_reviews: pendingVisitReviews,
      approved_reports: approvedReports,
      reviewed_visits: reviewedVisits,
      period: {
        date_from: dateFrom ?? this.monthStart(this.today()),
        date_to: dateTo ?? this.today(),
      },
    };
  }

  async getCompanySummary(
    actor: AuthenticatedUser,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const [reportsApproved, visitsReviewed, openFollowUps, openExceptions] =
      await Promise.all([
        this.reportRepository.count({
          where: { companyId, status: DailyActivityReportStatusEnum.APPROVED },
        }),
        this.visitRepository.count({
          where: { companyId, status: FieldVisitStatusEnum.REVIEWED },
        }),
        this.followUpRepository.count({
          where: { companyId, status: FieldFollowUpStatusEnum.OPEN },
        }),
        this.exceptionRepository.count({
          where: { companyId, status: 'OPEN' as never },
        }),
      ]);

    const potentialValue = await this.opportunityRepository
      .createQueryBuilder('opportunity')
      .select('COALESCE(SUM(opportunity.potentialValue), 0)', 'total')
      .where('opportunity.companyId = :companyId', { companyId })
      .getRawOne<{ total: string }>();

    return {
      period: {
        date_from: dateFrom ?? this.monthStart(this.today()),
        date_to: dateTo ?? this.today(),
      },
      approved_reports: reportsApproved,
      reviewed_visits: visitsReviewed,
      open_follow_ups: openFollowUps,
      open_exceptions: openExceptions,
      reported_potential_value: Number(potentialValue?.total ?? 0),
    };
  }
}
