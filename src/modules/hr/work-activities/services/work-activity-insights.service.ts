import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { Employee } from '../../employees/entities/employee.entity';
import { FieldParty } from '../entities/activity-config.entities';
import { WorkActivityException } from '../entities/analytics.entities';
import { DailyActivityReport } from '../entities/daily-activity.entities';
import {
  FieldFollowUp,
  FieldOpportunity,
  FieldVisit,
  FieldVisitCommercialPolicy,
  FieldVisitPlan,
  FieldVisitPlanItem,
} from '../entities/field-visit.entities';
import {
  FieldOpportunityTypeEnum,
  DailyActivityReportStatusEnum,
  FieldFollowUpStatusEnum,
  FieldVisitPlanStatusEnum,
  FieldVisitStatusEnum,
} from '../enums/work-activity.enums';
import { WorkActivityKpiProviderService } from './work-activity-kpi-provider.service';
import { buildDashboardEmployeeSubquery } from '../../dashboards/dashboard-employee-scope';

@Injectable()
export class WorkActivityInsightsService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly kpiProviderService: WorkActivityKpiProviderService,
    @InjectRepository(DailyActivityReport)
    private readonly reportRepository: Repository<DailyActivityReport>,
    @InjectRepository(FieldVisit)
    private readonly visitRepository: Repository<FieldVisit>,
    @InjectRepository(FieldVisitPlanItem)
    private readonly visitPlanItemRepository: Repository<FieldVisitPlanItem>,
    @InjectRepository(FieldOpportunity)
    private readonly opportunityRepository: Repository<FieldOpportunity>,
    @InjectRepository(FieldVisitCommercialPolicy)
    private readonly commercialPolicyRepository: Repository<FieldVisitCommercialPolicy>,
    @InjectRepository(FieldFollowUp)
    private readonly followUpRepository: Repository<FieldFollowUp>,
    @InjectRepository(WorkActivityException)
    private readonly exceptionRepository: Repository<WorkActivityException>,
  ) {}

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

    const employeeScope = buildDashboardEmployeeSubquery(
      actor.companyId,
      {},
      await this.hrAccessService.getAccessibleEmployeeSqlScope(actor),
    );

    const [
      pendingActivityReviews,
      pendingVisitReviews,
      approvedReports,
      reviewedVisits,
    ] = await Promise.all([
      this.reportRepository
        .createQueryBuilder('report')
        .where('report.companyId = :companyId', { companyId: actor.companyId })
        .andWhere('report.status = :status', {
          status: DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING,
        })
        .andWhere(`report.employeeId IN (${employeeScope.sql})`)
        .setParameters(employeeScope.params)
        .getCount(),
      this.visitRepository
        .createQueryBuilder('visit')
        .where('visit.companyId = :companyId', { companyId: actor.companyId })
        .andWhere('visit.status = :status', {
          status: FieldVisitStatusEnum.MANAGER_REVIEW_PENDING,
        })
        .andWhere(`visit.employeeId IN (${employeeScope.sql})`)
        .setParameters(employeeScope.params)
        .getCount(),
      this.reportRepository
        .createQueryBuilder('report')
        .where('report.companyId = :companyId', { companyId: actor.companyId })
        .andWhere('report.status = :status', {
          status: DailyActivityReportStatusEnum.APPROVED,
        })
        .andWhere(`report.employeeId IN (${employeeScope.sql})`)
        .setParameters(employeeScope.params)
        .getCount(),
      this.visitRepository
        .createQueryBuilder('visit')
        .where('visit.companyId = :companyId', { companyId: actor.companyId })
        .andWhere('visit.status = :status', {
          status: FieldVisitStatusEnum.REVIEWED,
        })
        .andWhere(`visit.employeeId IN (${employeeScope.sql})`)
        .setParameters(employeeScope.params)
        .getCount(),
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

  async getSalesFieldDetails(
    actor: AuthenticatedUser,
    args: {
      metric:
        | 'PLANNED_VISITS'
        | 'COMPLETED_PLANNED_VISITS'
        | 'UNPLANNED_COMPLETED_VISITS'
        | 'CUSTOMER_VISITS'
        | 'BROKER_INTERMEDIARY_VISITS'
        | 'OPPORTUNITIES';
      date_from: string;
      date_to: string;
      branch_id?: number;
      department_id?: number;
      employee_id?: number;
      currency?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employeeScope = buildDashboardEmployeeSubquery(
      companyId,
      args,
      await this.hrAccessService.getAccessibleEmployeeSqlScope(actor),
    );
    const page = Math.max(1, args.page ?? 1);
    const limit = Math.min(100, Math.max(1, args.limit ?? 25));
    const skip = (page - 1) * limit;
    let rows: Array<Record<string, unknown>>;
    let total: number;

    if (
      args.metric === 'PLANNED_VISITS' ||
      args.metric === 'COMPLETED_PLANNED_VISITS'
    ) {
      const query = () => {
        const builder = this.visitPlanItemRepository
          .createQueryBuilder('item')
          .innerJoin(
            FieldVisitPlan,
            'plan',
            'plan.id = item.visit_plan_id AND plan.company_id = item.company_id',
          )
          .innerJoin(
            Employee,
            'employee',
            'employee.id = plan.employee_id AND employee.company_id = plan.company_id',
          )
          .select('item.id', 'plan_item_id')
          .addSelect('plan.id', 'plan_id')
          .addSelect('plan.visitDate', 'plan_date')
          .addSelect('plan.status', 'plan_status')
          .addSelect('employee.id', 'employee_id')
          .addSelect('employee.employee_no', 'employee_no')
          .addSelect(
            `CONCAT_WS(' ', employee.first_name, NULLIF(employee.middle_name, ''), employee.last_name)`,
            'employee_name',
          )
          .addSelect('item.visitType', 'visit_type')
          .addSelect('item.purpose', 'purpose')
          .addSelect(
            `(SELECT COUNT(*) FROM field_visits linked_visit WHERE linked_visit.company_id = item.company_id AND linked_visit.visit_plan_item_id = item.id)`,
            'linked_visit_count',
          )
          .addSelect(
            `(SELECT COUNT(*) FROM field_visits completed_visit WHERE completed_visit.company_id = item.company_id AND completed_visit.visit_plan_item_id = item.id AND completed_visit.status = :completedStatus AND completed_visit.manager_review_status = :approvedReviewStatus)`,
            'qualifying_completed_visit_count',
          )
          .addSelect(
            `(SELECT COUNT(*) FROM field_visits cancelled_visit WHERE cancelled_visit.company_id = item.company_id AND cancelled_visit.visit_plan_item_id = item.id AND cancelled_visit.status = :cancelledStatus)`,
            'cancelled_visit_count',
          )
          .where('plan.companyId = :companyId', { companyId })
          .andWhere('plan.visitDate BETWEEN :dateFrom AND :dateTo', {
            dateFrom: args.date_from,
            dateTo: args.date_to,
          })
          .andWhere('plan.status IN (:...eligibleStatuses)', {
            eligibleStatuses: [
              FieldVisitPlanStatusEnum.SUBMITTED,
              FieldVisitPlanStatusEnum.APPROVED,
              FieldVisitPlanStatusEnum.IN_PROGRESS,
              FieldVisitPlanStatusEnum.COMPLETED,
              FieldVisitPlanStatusEnum.LOCKED,
            ],
          })
          .andWhere(
            `(NOT EXISTS (SELECT 1 FROM field_visits any_visit WHERE any_visit.company_id = item.company_id AND any_visit.visit_plan_item_id = item.id) OR EXISTS (SELECT 1 FROM field_visits active_visit WHERE active_visit.company_id = item.company_id AND active_visit.visit_plan_item_id = item.id AND active_visit.status <> :cancelledStatus))`,
          )
          .andWhere(`plan.employeeId IN (${employeeScope.sql})`)
          .setParameters({
            ...employeeScope.params,
            completedStatus: FieldVisitStatusEnum.REVIEWED,
            approvedReviewStatus: 'APPROVED',
            cancelledStatus: FieldVisitStatusEnum.CANCELLED,
          });
        if (args.metric === 'COMPLETED_PLANNED_VISITS') {
          builder.andWhere(
            `EXISTS (SELECT 1 FROM field_visits completed_item_visit WHERE completed_item_visit.company_id = item.company_id AND completed_item_visit.visit_plan_item_id = item.id AND completed_item_visit.status = :completedStatus AND completed_item_visit.manager_review_status = :approvedReviewStatus)`,
          );
        }
        return builder;
      };
      total = await query().getCount();
      rows = await query()
        .orderBy('plan.visitDate', 'DESC')
        .addOrderBy('employee.employee_no', 'ASC')
        .addOrderBy('item.id', 'ASC')
        .skip(skip)
        .take(limit)
        .getRawMany<Record<string, unknown>>();
    } else if (
      args.metric === 'UNPLANNED_COMPLETED_VISITS' ||
      args.metric === 'CUSTOMER_VISITS' ||
      args.metric === 'BROKER_INTERMEDIARY_VISITS'
    ) {
      const query = () => {
        const builder = this.visitRepository
          .createQueryBuilder('visit')
          .innerJoin(
            Employee,
            'employee',
            'employee.id = visit.employee_id AND employee.company_id = visit.company_id',
          )
          .leftJoin(
            FieldParty,
            'party',
            'party.id = visit.field_party_id AND party.company_id = visit.company_id',
          )
          .select('visit.id', 'visit_id')
          .addSelect('visit.visitNo', 'visit_no')
          .addSelect('visit.visitDate', 'visit_date')
          .addSelect('employee.id', 'employee_id')
          .addSelect('employee.employee_no', 'employee_no')
          .addSelect(
            `CONCAT_WS(' ', employee.first_name, NULLIF(employee.middle_name, ''), employee.last_name)`,
            'employee_name',
          )
          .addSelect('visit.visitType', 'visit_type')
          .addSelect('visit.purpose', 'purpose')
          .addSelect('party.partyType', 'party_type')
          .addSelect('visit.durationMinutes', 'duration_minutes')
          .where('visit.companyId = :companyId', { companyId })
          .andWhere('visit.visitDate BETWEEN :dateFrom AND :dateTo', {
            dateFrom: args.date_from,
            dateTo: args.date_to,
          })
          .andWhere('visit.status = :completedStatus', {
            completedStatus: FieldVisitStatusEnum.REVIEWED,
          })
          .andWhere('visit.managerReviewStatus = :approvedReviewStatus', {
            approvedReviewStatus: 'APPROVED',
          })
          .andWhere(`visit.employeeId IN (${employeeScope.sql})`)
          .setParameters(employeeScope.params);
        if (args.metric === 'UNPLANNED_COMPLETED_VISITS') {
          builder.andWhere('visit.isUnplanned = :isUnplanned', {
            isUnplanned: true,
          });
        } else {
          builder.andWhere('party.partyType IN (:...partyTypes)', {
            partyTypes:
              args.metric === 'CUSTOMER_VISITS'
                ? ['CUSTOMER']
                : ['BROKER', 'INTERMEDIARY'],
          });
        }
        return builder;
      };
      total = await query().getCount();
      rows = await query()
        .orderBy('visit.visitDate', 'DESC')
        .addOrderBy('visit.id', 'DESC')
        .skip(skip)
        .take(limit)
        .getRawMany<Record<string, unknown>>();
    } else {
      const commercialPolicy = await this.commercialPolicyRepository.findOne({
        where: { companyId },
      });
      const defaultCurrency = commercialPolicy?.defaultCurrency ?? 'TZS';
      const query = () =>
        this.opportunityRepository
          .createQueryBuilder('opportunity')
          .innerJoin(
            FieldVisit,
            'visit',
            'visit.id = opportunity.field_visit_id AND visit.company_id = opportunity.company_id',
          )
          .innerJoin(
            Employee,
            'employee',
            'employee.id = opportunity.employee_id AND employee.company_id = opportunity.company_id',
          )
          .select('opportunity.id', 'opportunity_id')
          .addSelect('visit.visitDate', 'visit_date')
          .addSelect('employee.id', 'employee_id')
          .addSelect('employee.employee_no', 'employee_no')
          .addSelect(
            `CONCAT_WS(' ', employee.first_name, NULLIF(employee.middle_name, ''), employee.last_name)`,
            'employee_name',
          )
          .addSelect('opportunity.opportunityType', 'opportunity_type')
          .addSelect('opportunity.title', 'title')
          .addSelect('opportunity.status', 'status')
          .addSelect(
            'COALESCE(opportunity.currency, :defaultCurrency)',
            'currency',
          )
          .addSelect('opportunity.potentialValue', 'potential_value')
          .addSelect('opportunity.actualValue', 'actual_value')
          .addSelect('opportunity.validatedByManager', 'validated_by_manager')
          .where('opportunity.companyId = :companyId', { companyId })
          .andWhere('visit.visitDate BETWEEN :dateFrom AND :dateTo', {
            dateFrom: args.date_from,
            dateTo: args.date_to,
          })
          .andWhere(`opportunity.employeeId IN (${employeeScope.sql})`)
          .andWhere(
            args.currency
              ? 'COALESCE(opportunity.currency, :defaultCurrency) = :detailCurrency'
              : '1 = 1',
            args.currency ? { detailCurrency: args.currency } : {},
          )
          .setParameters({
            ...employeeScope.params,
            defaultCurrency,
          });
      total = await query().getCount();
      rows = await query()
        .orderBy('visit.visitDate', 'DESC')
        .addOrderBy('opportunity.id', 'DESC')
        .skip(skip)
        .take(limit)
        .getRawMany<Record<string, unknown>>();
    }

    return {
      metric: args.metric,
      period: { date_from: args.date_from, date_to: args.date_to },
      generated_at: new Date().toISOString(),
      rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  async getCompanySummary(
    actor: AuthenticatedUser,
    dateFrom?: string,
    dateTo?: string,
    filters: {
      branch_id?: number;
      department_id?: number;
      employee_id?: number;
    } = {},
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employeeScope = buildDashboardEmployeeSubquery(
      companyId,
      filters,
      await this.hrAccessService.getAccessibleEmployeeSqlScope(actor),
    );
    const commercialPolicy = await this.commercialPolicyRepository.findOne({
      where: { companyId },
    });
    const defaultCurrency = commercialPolicy?.defaultCurrency ?? 'TZS';
    const effectiveDateFrom = dateFrom ?? this.monthStart(this.today());
    const effectiveDateTo = dateTo ?? this.today();
    const [reportsApproved, visitMetrics, openFollowUps, openExceptions] =
      await Promise.all([
        this.reportRepository
          .createQueryBuilder('report')
          .where('report.companyId = :companyId', { companyId })
          .andWhere('report.status = :status', {
            status: DailyActivityReportStatusEnum.APPROVED,
          })
          .andWhere(`report.employeeId IN (${employeeScope.sql})`)
          .setParameters(employeeScope.params)
          .getCount(),
        this.visitRepository
          .createQueryBuilder('visit')
          .leftJoin(
            FieldParty,
            'party',
            'party.id = visit.field_party_id AND party.company_id = visit.company_id',
          )
          .select(
            'COUNT(DISTINCT visit.id) FILTER (WHERE visit.status = :reviewedStatus)',
            'reviewed_visits',
          )
          .addSelect(
            `COUNT(DISTINCT visit.id) FILTER (WHERE visit.status = :reviewedStatus AND visit.managerReviewStatus = :approvedReviewStatus AND party.party_type = :customerPartyType)`,
            'customer_visits',
          )
          .addSelect(
            `COUNT(DISTINCT visit.id) FILTER (WHERE visit.status = :reviewedStatus AND visit.managerReviewStatus = :approvedReviewStatus AND party.party_type IN (:...brokerPartyTypes))`,
            'broker_intermediary_visits',
          )
          .where('visit.companyId = :companyId', { companyId })
          .andWhere('visit.visitDate BETWEEN :dateFrom AND :dateTo', {
            dateFrom: effectiveDateFrom,
            dateTo: effectiveDateTo,
          })
          .andWhere(`visit.employeeId IN (${employeeScope.sql})`)
          .setParameters({
            ...employeeScope.params,
            reviewedStatus: FieldVisitStatusEnum.REVIEWED,
            approvedReviewStatus: 'APPROVED',
            customerPartyType: 'CUSTOMER',
            brokerPartyTypes: ['BROKER', 'INTERMEDIARY'],
          })
          .getRawOne<{
            reviewed_visits?: string | number;
            customer_visits?: string | number;
            broker_intermediary_visits?: string | number;
          }>(),
        this.followUpRepository
          .createQueryBuilder('followUp')
          .where('followUp.companyId = :companyId', { companyId })
          .andWhere('followUp.status = :status', {
            status: FieldFollowUpStatusEnum.OPEN,
          })
          .andWhere(`followUp.employeeId IN (${employeeScope.sql})`)
          .setParameters(employeeScope.params)
          .getCount(),
        this.exceptionRepository
          .createQueryBuilder('exception')
          .where('exception.companyId = :companyId', { companyId })
          .andWhere('exception.status = :status', { status: 'OPEN' })
          .andWhere(`exception.employeeId IN (${employeeScope.sql})`)
          .setParameters(employeeScope.params)
          .getCount(),
      ]);

    const commercialSummary = await this.getCommercialSummaryForScope(
      companyId,
      effectiveDateFrom,
      effectiveDateTo,
      employeeScope,
    );
    const visitProductivity = await this.getPlannedVisitProductivity(
      companyId,
      effectiveDateFrom,
      effectiveDateTo,
      employeeScope,
    );
    const defaultCurrencySales = commercialSummary.sales_by_currency.find(
      (row) => row.currency === defaultCurrency,
    );

    return {
      period: {
        date_from: effectiveDateFrom,
        date_to: effectiveDateTo,
      },
      approved_reports: reportsApproved,
      reviewed_visits: Number(visitMetrics?.reviewed_visits ?? 0),
      customer_visits: Number(visitMetrics?.customer_visits ?? 0),
      broker_intermediary_visits: Number(
        visitMetrics?.broker_intermediary_visits ?? 0,
      ),
      open_follow_ups: openFollowUps,
      open_exceptions: openExceptions,
      planned_visit_items: visitProductivity.planned_visit_items,
      completed_planned_visit_items:
        visitProductivity.completed_planned_visit_items,
      planned_visit_completion_rate:
        visitProductivity.planned_visit_completion_rate,
      unplanned_completed_visits: visitProductivity.unplanned_completed_visits,
      visit_productivity_definition: {
        period_basis: 'PLAN_DATE',
        eligible_plan_statuses: [
          FieldVisitPlanStatusEnum.SUBMITTED,
          FieldVisitPlanStatusEnum.APPROVED,
          FieldVisitPlanStatusEnum.IN_PROGRESS,
          FieldVisitPlanStatusEnum.COMPLETED,
          FieldVisitPlanStatusEnum.LOCKED,
        ],
        completed_status: 'REVIEWED_AND_MANAGER_APPROVED',
      },
      reported_potential_value: Number(
        defaultCurrencySales?.potential_value ?? 0,
      ),
      reported_potential_currency: defaultCurrency,
      reported_potential_value_by_currency: commercialSummary.sales_by_currency,
      reported_premium_value_by_currency: commercialSummary.premium_by_currency,
    };
  }

  private async getPlannedVisitProductivity(
    companyId: number,
    dateFrom: string,
    dateTo: string,
    employeeScope: { sql: string; params: Record<string, unknown> },
  ) {
    const eligibleStatuses = [
      FieldVisitPlanStatusEnum.SUBMITTED,
      FieldVisitPlanStatusEnum.APPROVED,
      FieldVisitPlanStatusEnum.IN_PROGRESS,
      FieldVisitPlanStatusEnum.COMPLETED,
      FieldVisitPlanStatusEnum.LOCKED,
    ];
    const [plannedRows, unplannedRows] = await Promise.all([
      this.visitPlanItemRepository
        .createQueryBuilder('item')
        .innerJoin(
          FieldVisitPlan,
          'plan',
          'plan.id = item.visitPlanId AND plan.companyId = item.companyId',
        )
        .leftJoin(
          FieldVisit,
          'visit',
          'visit.visitPlanItemId = item.id AND visit.companyId = item.companyId',
        )
        .select(
          `COUNT(DISTINCT item.id) FILTER (WHERE visit.id IS NULL OR visit.status <> :cancelledStatus)`,
          'planned_item_count',
        )
        .addSelect(
          `COUNT(DISTINCT item.id) FILTER (WHERE visit.status = :completedStatus AND visit.managerReviewStatus = :approvedReviewStatus)`,
          'completed_item_count',
        )
        .where('plan.companyId = :companyId', { companyId })
        .andWhere('plan.visitDate BETWEEN :dateFrom AND :dateTo', {
          dateFrom,
          dateTo,
        })
        .andWhere('plan.status IN (:...eligibleStatuses)', {
          eligibleStatuses,
        })
        .andWhere(`plan.employeeId IN (${employeeScope.sql})`)
        .setParameters({
          ...employeeScope.params,
          cancelledStatus: FieldVisitStatusEnum.CANCELLED,
          completedStatus: FieldVisitStatusEnum.REVIEWED,
          approvedReviewStatus: 'APPROVED',
        })
        .getRawOne<{
          planned_item_count: string | number;
          completed_item_count: string | number;
        }>(),
      this.visitRepository
        .createQueryBuilder('visit')
        .select('COUNT(DISTINCT visit.id)', 'unplanned_completed_count')
        .where('visit.companyId = :companyId', { companyId })
        .andWhere('visit.visitDate BETWEEN :dateFrom AND :dateTo', {
          dateFrom,
          dateTo,
        })
        .andWhere('visit.isUnplanned = :isUnplanned', { isUnplanned: true })
        .andWhere('visit.status = :completedStatus', {
          completedStatus: FieldVisitStatusEnum.REVIEWED,
        })
        .andWhere('visit.managerReviewStatus = :approvedReviewStatus', {
          approvedReviewStatus: 'APPROVED',
        })
        .andWhere(`visit.employeeId IN (${employeeScope.sql})`)
        .setParameters(employeeScope.params)
        .getRawOne<{ unplanned_completed_count: string | number }>(),
    ]);
    const planned = Number(plannedRows?.planned_item_count ?? 0);
    const completed = Number(plannedRows?.completed_item_count ?? 0);
    return {
      planned_visit_items: planned,
      completed_planned_visit_items: completed,
      planned_visit_completion_rate:
        planned > 0 ? Number(((completed / planned) * 100).toFixed(2)) : null,
      unplanned_completed_visits: Number(
        unplannedRows?.unplanned_completed_count ?? 0,
      ),
    };
  }

  async getCommercialSummary(
    actor: AuthenticatedUser,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employeeScope = buildDashboardEmployeeSubquery(
      companyId,
      {},
      await this.hrAccessService.getAccessibleEmployeeSqlScope(actor),
    );
    return this.getCommercialSummaryForScope(
      companyId,
      dateFrom,
      dateTo,
      employeeScope,
    );
  }

  private async getCommercialSummaryForScope(
    companyId: number,
    dateFrom: string | undefined,
    dateTo: string | undefined,
    employeeScope: { sql: string; params: Record<string, unknown> },
  ) {
    const commercialPolicy = await this.commercialPolicyRepository.findOne({
      where: { companyId },
    });
    const defaultCurrency = commercialPolicy?.defaultCurrency ?? 'TZS';
    const query = this.opportunityRepository
      .createQueryBuilder('opportunity')
      .innerJoin(
        FieldVisit,
        'visit',
        'visit.id = opportunity.fieldVisitId AND visit.companyId = opportunity.companyId',
      )
      .select('COALESCE(opportunity.currency, :defaultCurrency)', 'currency')
      .addSelect('COUNT(opportunity.id)', 'opportunity_count')
      .addSelect(
        'COALESCE(SUM(opportunity.potentialValue), 0)',
        'potential_value',
      )
      .addSelect(
        'COALESCE(SUM(opportunity.actualValue) FILTER (WHERE opportunity.validatedByManager = true), 0)',
        'validated_actual_value',
      )
      .where('opportunity.companyId = :companyId', { companyId })
      .setParameter('defaultCurrency', defaultCurrency)
      .groupBy('COALESCE(opportunity.currency, :defaultCurrency)')
      .orderBy('currency', 'ASC');
    query
      .andWhere(`opportunity.employeeId IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    if (dateFrom) query.andWhere('visit.visitDate >= :dateFrom', { dateFrom });
    if (dateTo) query.andWhere('visit.visitDate <= :dateTo', { dateTo });
    const sales = await query.getRawMany<Record<string, string>>();
    const premiumQuery = this.opportunityRepository
      .createQueryBuilder('opportunity')
      .innerJoin(
        FieldVisit,
        'visit',
        'visit.id = opportunity.fieldVisitId AND visit.companyId = opportunity.companyId',
      )
      .select(
        'COALESCE(opportunity.premiumCurrency, :defaultCurrency)',
        'currency',
      )
      .addSelect('COALESCE(SUM(opportunity.premiumValue), 0)', 'premium_value')
      .where('opportunity.companyId = :companyId', { companyId })
      .andWhere('opportunity.premiumValue IS NOT NULL')
      .setParameter('defaultCurrency', defaultCurrency)
      .groupBy('COALESCE(opportunity.premiumCurrency, :defaultCurrency)');
    premiumQuery
      .andWhere(`opportunity.employeeId IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    if (dateFrom)
      premiumQuery.andWhere('visit.visitDate >= :dateFrom', { dateFrom });
    if (dateTo) premiumQuery.andWhere('visit.visitDate <= :dateTo', { dateTo });
    const premium = await premiumQuery.getRawMany<Record<string, string>>();
    const statusQuery = this.opportunityRepository
      .createQueryBuilder('opportunity')
      .innerJoin(
        FieldVisit,
        'visit',
        'visit.id = opportunity.fieldVisitId AND visit.companyId = opportunity.companyId',
      )
      .select('opportunity.status', 'status')
      .addSelect('COUNT(opportunity.id)', 'opportunity_count')
      .where('opportunity.companyId = :companyId', { companyId })
      .groupBy('opportunity.status')
      .orderBy('opportunity.status', 'ASC');
    statusQuery
      .andWhere(`opportunity.employeeId IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    if (dateFrom)
      statusQuery.andWhere('visit.visitDate >= :dateFrom', { dateFrom });
    if (dateTo) statusQuery.andWhere('visit.visitDate <= :dateTo', { dateTo });
    const statuses = await statusQuery.getRawMany<Record<string, string>>();
    const typeStatusQuery = this.opportunityRepository
      .createQueryBuilder('opportunity')
      .innerJoin(
        FieldVisit,
        'visit',
        'visit.id = opportunity.fieldVisitId AND visit.companyId = opportunity.companyId',
      )
      .select('opportunity.opportunityType', 'opportunity_type')
      .addSelect('opportunity.status', 'status')
      .addSelect('COUNT(opportunity.id)', 'opportunity_count')
      .where('opportunity.companyId = :companyId', { companyId })
      .groupBy('opportunity.opportunityType')
      .addGroupBy('opportunity.status')
      .orderBy('opportunity.opportunityType', 'ASC')
      .addOrderBy('opportunity.status', 'ASC');
    typeStatusQuery
      .andWhere(`opportunity.employeeId IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    if (dateFrom)
      typeStatusQuery.andWhere('visit.visitDate >= :dateFrom', { dateFrom });
    if (dateTo)
      typeStatusQuery.andWhere('visit.visitDate <= :dateTo', { dateTo });
    const typeStatuses =
      await typeStatusQuery.getRawMany<Record<string, string>>();
    return {
      period: { date_from: dateFrom ?? null, date_to: dateTo ?? null },
      sales_by_currency: sales.map((row) => ({
        currency: row.currency,
        opportunity_count: Number(row.opportunity_count),
        potential_value: row.potential_value,
        validated_actual_value: row.validated_actual_value,
      })),
      premium_by_currency: premium.map((row) => ({
        currency: row.currency,
        premium_value: row.premium_value,
      })),
      opportunity_status_counts: statuses.map((row) => ({
        status: row.status,
        opportunity_count: Number(row.opportunity_count),
      })),
      opportunity_type_status_counts: typeStatuses.map((row) => ({
        opportunity_type: row.opportunity_type as FieldOpportunityTypeEnum,
        status: row.status,
        opportunity_count: Number(row.opportunity_count),
      })),
    };
  }
}
