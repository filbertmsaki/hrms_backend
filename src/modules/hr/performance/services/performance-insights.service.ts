import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { ObjectLiteral } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformanceDevelopmentPlan } from '../entities/performance-development-plan.entity';
import { PerformanceFeedback360Request } from '../entities/performance-feedback-360-request.entity';
import { PerformanceImprovementPlan } from '../entities/performance-improvement-plan.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { KpiAchievementStatusEnum } from '../enums/kpi-achievement-status.enum';
import { PerformancePeriodStatusEnum } from '../enums/performance-period-status.enum';
import { PerformanceReviewStatusEnum } from '../enums/performance-review-status.enum';
import { EmployeeKpi } from '../entities/employee-kpi.entity';
import { EmployeeKpiStatusEnum } from '../enums/employee-kpi-status.enum';
import { PerformanceFeedback360StatusEnum } from '../enums/performance-feedback-360-status.enum';
import { Employee } from '../../employees/entities/employee.entity';
import { PerformanceAggregate } from '../entities/performance-aggregate.entity';
import { PerformancePeriodTypeEnum } from '../enums/performance-period-type.enum';
import { PerformanceRatingBand } from '../entities/performance-rating-band.entity';
import { buildDashboardEmployeeSubquery } from '../../dashboards/dashboard-employee-scope';

@Injectable()
export class PerformanceInsightsService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PerformancePeriod)
    private readonly periodRepository: Repository<PerformancePeriod>,
    @InjectRepository(KpiAchievement)
    private readonly achievementRepository: Repository<KpiAchievement>,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
    @InjectRepository(EmployeeKpi)
    private readonly employeeKpiRepository: Repository<EmployeeKpi>,
    @InjectRepository(PerformanceDevelopmentPlan)
    private readonly developmentPlanRepository: Repository<PerformanceDevelopmentPlan>,
    @InjectRepository(PerformanceImprovementPlan)
    private readonly pipRepository: Repository<PerformanceImprovementPlan>,
    @InjectRepository(PerformanceFeedback360Request)
    private readonly feedback360Repository: Repository<PerformanceFeedback360Request>,
    @InjectRepository(PerformanceAggregate)
    private readonly aggregateRepository: Repository<PerformanceAggregate>,
  ) {}

  async getPublishedAggregateSeries(
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

    const query = this.aggregateRepository
      .createQueryBuilder('aggregate')
      .innerJoin(
        PerformancePeriod,
        'period',
        'period.companyId = aggregate.companyId AND period.financialYearId = aggregate.financialYearId AND period.periodType = aggregate.periodType AND period.sequenceNumber = aggregate.sequenceNumber',
      )
      .select('aggregate.periodType', 'period_type')
      .addSelect('aggregate.financialYearId', 'financial_year_id')
      .addSelect('aggregate.sequenceNumber', 'sequence_number')
      .addSelect('aggregate.name', 'period_name')
      .addSelect('COUNT(aggregate.id)', 'published_employee_count')
      .addSelect('MAX(aggregate.publishedAt)', 'latest_published_at')
      .addSelect(
        'AVG(CAST(aggregate.aggregateScore AS numeric))',
        'average_score',
      )
      .where('aggregate.companyId = :companyId', { companyId })
      .andWhere('aggregate.publishedAt IS NOT NULL')
      .andWhere('aggregate.periodType IN (:...periodTypes)', {
        periodTypes: [
          PerformancePeriodTypeEnum.QUARTERLY,
          PerformancePeriodTypeEnum.ANNUAL,
        ],
      })
      .groupBy('aggregate.periodType')
      .addGroupBy('aggregate.financialYearId')
      .addGroupBy('aggregate.sequenceNumber')
      .addGroupBy('aggregate.name')
      .orderBy('aggregate.financialYearId', 'ASC')
      .addOrderBy('aggregate.sequenceNumber', 'ASC');
    query
      .andWhere(`aggregate.employeeId IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    if (dateFrom) {
      query.andWhere('period.endDate >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      query.andWhere('period.startDate <= :dateTo', { dateTo });
    }
    const rows = await query.getRawMany<{
      period_type: PerformancePeriodTypeEnum;
      financial_year_id: string | number;
      sequence_number: string | number;
      period_name: string;
      published_employee_count: string;
      latest_published_at: Date | string | null;
      average_score: string | null;
    }>();

    const project = (row: (typeof rows)[number]) => ({
      financial_year_id: Number(row.financial_year_id),
      sequence_number: Number(row.sequence_number),
      period_name: row.period_name,
      published_employee_count: Number(row.published_employee_count),
      latest_published_at: row.latest_published_at,
      average_score:
        row.average_score === null ? null : Number(row.average_score),
    });
    const latestPublication = (
      periodType: PerformancePeriodTypeEnum,
    ): string | null => {
      const timestamps = rows
        .filter((row) => row.period_type === periodType)
        .map((row) => row.latest_published_at)
        .filter((value): value is Date | string => value !== null)
        .map((value) =>
          value instanceof Date ? value.getTime() : new Date(value).getTime(),
        )
        .filter((value) => Number.isFinite(value));
      return timestamps.length
        ? new Date(Math.max(...timestamps)).toISOString()
        : null;
    };
    return {
      quarterly_trend: rows
        .filter(
          (row) => row.period_type === PerformancePeriodTypeEnum.QUARTERLY,
        )
        .map(project),
      quarterly_latest_published_at: latestPublication(
        PerformancePeriodTypeEnum.QUARTERLY,
      ),
      annual_average_by_year: rows
        .filter((row) => row.period_type === PerformancePeriodTypeEnum.ANNUAL)
        .map(project),
      annual_latest_published_at: latestPublication(
        PerformancePeriodTypeEnum.ANNUAL,
      ),
      publication_state: rows.length
        ? 'PUBLISHED_AGGREGATES_AVAILABLE'
        : 'NO_PUBLISHED_AGGREGATES',
    };
  }

  async getCompanySummary(
    actor: AuthenticatedUser,
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
    const [
      openPeriods,
      pendingManagerValidation,
      pendingHrApproval,
      publishedReviews,
      pendingKpiProposals,
      approvedKpiProposals,
      activeDevelopmentPlans,
      activePips,
      pendingFeedback360,
    ] = await Promise.all([
      this.periodRepository.count({
        where: {
          companyId,
          status: PerformancePeriodStatusEnum.OPEN,
        },
      }),
      this.countScopedEmployees(
        this.achievementRepository,
        'achievement',
        'employeeId',
        companyId,
        employeeScope,
        {
          condition: 'achievement.status = :status',
          parameters: { status: KpiAchievementStatusEnum.EMPLOYEE_SUBMITTED },
        },
      ),
      this.countScopedEmployees(
        this.achievementRepository,
        'achievement',
        'employeeId',
        companyId,
        employeeScope,
        {
          condition: 'achievement.status = :status',
          parameters: { status: KpiAchievementStatusEnum.MANAGER_VALIDATED },
        },
      ),
      this.countScopedEmployees(
        this.reviewRepository,
        'review',
        'employeeId',
        companyId,
        employeeScope,
        {
          condition: 'review.status = :status',
          parameters: { status: PerformanceReviewStatusEnum.PUBLISHED },
        },
      ),
      this.countScopedEmployees(
        this.employeeKpiRepository,
        'employeeKpi',
        'employeeId',
        companyId,
        employeeScope,
        {
          condition: 'employeeKpi.status IN (:...statuses)',
          parameters: {
            statuses: [
              EmployeeKpiStatusEnum.SUBMITTED,
              EmployeeKpiStatusEnum.RESUBMITTED,
              EmployeeKpiStatusEnum.PENDING_REVIEW,
            ],
          },
        },
      ),
      this.countScopedEmployees(
        this.employeeKpiRepository,
        'employeeKpi',
        'employeeId',
        companyId,
        employeeScope,
        {
          condition: 'employeeKpi.status = :status',
          parameters: { status: EmployeeKpiStatusEnum.APPROVED },
        },
      ),
      this.countScopedEmployees(
        this.developmentPlanRepository,
        'plan',
        'employeeId',
        companyId,
        employeeScope,
        {
          condition: 'plan.status = :status',
          parameters: { status: 'ACTIVE' },
        },
      ),
      this.countScopedEmployees(
        this.pipRepository,
        'pip',
        'employeeId',
        companyId,
        employeeScope,
        {
          condition: 'pip.status IN (:...statuses)',
          parameters: { statuses: ['ACTIVE', 'DRAFT'] },
        },
      ),
      this.countScopedEmployees(
        this.feedback360Repository,
        'feedback',
        'subjectEmployeeId',
        companyId,
        employeeScope,
        {
          condition: 'feedback.status = :status',
          parameters: { status: PerformanceFeedback360StatusEnum.PENDING },
        },
      ),
    ]);

    const finalScoreRow = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.finalScore)', 'average_score')
      .where('review.companyId = :companyId', { companyId })
      .andWhere('review.status = :status', {
        status: PerformanceReviewStatusEnum.PUBLISHED,
      })
      .andWhere(`review.employeeId IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params)
      .getRawOne<{ average_score: string | null }>();

    return {
      open_periods: openPeriods,
      pending_manager_validation: pendingManagerValidation,
      pending_hr_approval: pendingHrApproval,
      published_reviews: publishedReviews,
      pending_kpi_proposals: pendingKpiProposals,
      approved_kpi_proposals: approvedKpiProposals,
      active_development_plans: activeDevelopmentPlans,
      active_improvement_plans: activePips,
      pending_feedback_360: pendingFeedback360,
      average_published_score:
        finalScoreRow?.average_score === null ||
        finalScoreRow?.average_score === undefined
          ? null
          : Number(Number(finalScoreRow.average_score).toFixed(2)),
    };
  }

  private async countScopedEmployees<T extends ObjectLiteral>(
    repository: Repository<T>,
    alias: string,
    employeeColumn: string,
    companyId: number,
    employeeScope: { sql: string; params: Record<string, unknown> },
    additional?: { condition: string; parameters: Record<string, unknown> },
  ) {
    const query = repository
      .createQueryBuilder(alias)
      .where(`${alias}.companyId = :companyId`, { companyId })
      .andWhere(`${alias}.${employeeColumn} IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    if (additional) {
      query.andWhere(additional.condition, additional.parameters);
    }
    return query.getCount();
  }

  async getEmployeeSummary(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) {
      return {
        latest_published_score: null,
        published_reviews: 0,
        pending_kpis: 0,
      };
    }

    const [
      publishedReviews,
      pendingKpis,
      latestPublishedReview,
      employeeKpis,
      approvedEmployeeKpis,
      returnedEmployeeKpis,
      developmentPlans,
      pendingFeedback360,
    ] = await Promise.all([
      this.reviewRepository.count({
        where: {
          companyId,
          employeeId: actor.employeeId,
          status: PerformanceReviewStatusEnum.PUBLISHED,
        },
      }),
      this.achievementRepository.count({
        where: {
          companyId,
          employeeId: actor.employeeId,
          status: KpiAchievementStatusEnum.NOT_STARTED,
        },
      }),
      this.reviewRepository.findOne({
        where: {
          companyId,
          employeeId: actor.employeeId,
          status: PerformanceReviewStatusEnum.PUBLISHED,
        },
        order: { publishedAt: 'DESC', id: 'DESC' },
      }),
      this.employeeKpiRepository.count({
        where: { companyId, employeeId: actor.employeeId },
      }),
      this.employeeKpiRepository.count({
        where: {
          companyId,
          employeeId: actor.employeeId,
          status: EmployeeKpiStatusEnum.APPROVED,
        },
      }),
      this.employeeKpiRepository.count({
        where: {
          companyId,
          employeeId: actor.employeeId,
          status: EmployeeKpiStatusEnum.RETURNED,
        },
      }),
      this.developmentPlanRepository.count({
        where: { companyId, employeeId: actor.employeeId, status: 'ACTIVE' },
      }),
      this.feedback360Repository.count({
        where: {
          companyId,
          raterEmployeeId: actor.employeeId,
          status: PerformanceFeedback360StatusEnum.PENDING,
        },
      }),
    ]);

    return {
      latest_published_score: latestPublishedReview?.finalScore ?? null,
      latest_rating_code: latestPublishedReview?.ratingCode ?? null,
      published_reviews: publishedReviews,
      pending_kpis: pendingKpis,
      employee_kpis: employeeKpis,
      approved_employee_kpis: approvedEmployeeKpis,
      returned_employee_kpis: returnedEmployeeKpis,
      development_plans: developmentPlans,
      pending_feedback_360: pendingFeedback360,
    };
  }

  async getManagerSummary(
    actor: AuthenticatedUser,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) {
      return {
        pending_team_validations: 0,
        published_team_reviews: 0,
      };
    }

    const [
      pendingTeamValidations,
      publishedTeamReviews,
      pendingKpiReviews,
      approvedTeamKpis,
      activeTeamDevelopmentPlans,
      pendingTeamFeedback360,
    ] = await Promise.all([
      this.achievementRepository
        .createQueryBuilder('achievement')
        .innerJoin(
          'performance_period_assignments',
          'assignment',
          'assignment.id = achievement.period_assignment_id',
        )
        .where('achievement.company_id = :companyId', { companyId })
        .andWhere('assignment.manager_employee_id = :managerEmployeeId', {
          managerEmployeeId: actor.employeeId,
        })
        .andWhere('achievement.status = :status', {
          status: KpiAchievementStatusEnum.EMPLOYEE_SUBMITTED,
        })
        .getCount(),
      (() => {
        const query = this.reviewRepository
          .createQueryBuilder('review')
          .innerJoin(
            'performance_periods',
            'period',
            'period.id = review.performance_period_id AND period.company_id = review.company_id',
          )
          .where('review.company_id = :companyId', { companyId })
          .andWhere('review.manager_employee_id = :managerEmployeeId', {
            managerEmployeeId: actor.employeeId,
          })
          .andWhere('review.status = :status', {
            status: PerformanceReviewStatusEnum.PUBLISHED,
          });
        if (dateFrom) {
          query.andWhere('period.end_date >= :dateFrom', { dateFrom });
        }
        if (dateTo) {
          query.andWhere('period.start_date <= :dateTo', { dateTo });
        }
        return query.getCount();
      })(),
      this.employeeKpiRepository.count({
        where: {
          companyId,
          reviewerEmployeeId: actor.employeeId,
          status: In([
            EmployeeKpiStatusEnum.SUBMITTED,
            EmployeeKpiStatusEnum.RESUBMITTED,
            EmployeeKpiStatusEnum.PENDING_REVIEW,
          ]),
        },
      }),
      this.employeeKpiRepository.count({
        where: {
          companyId,
          reviewerEmployeeId: actor.employeeId,
          status: EmployeeKpiStatusEnum.APPROVED,
        },
      }),
      this.developmentPlanRepository.count({
        where: {
          companyId,
          managerEmployeeId: actor.employeeId,
          status: 'ACTIVE',
        },
      }),
      this.feedback360Repository
        .createQueryBuilder('feedback')
        .innerJoin(
          'employees',
          'employee',
          'employee.id = feedback.subject_employee_id',
        )
        .where('feedback.company_id = :companyId', { companyId })
        .andWhere('employee.reports_to = :managerEmployeeId', {
          managerEmployeeId: actor.employeeId,
        })
        .andWhere('feedback.status = :status', {
          status: PerformanceFeedback360StatusEnum.PENDING,
        })
        .getCount(),
    ]);

    return {
      pending_team_validations: pendingTeamValidations,
      published_team_reviews: publishedTeamReviews,
      pending_kpi_reviews: pendingKpiReviews,
      approved_team_kpis: approvedTeamKpis,
      active_team_development_plans: activeTeamDevelopmentPlans,
      pending_team_feedback_360: pendingTeamFeedback360,
    };
  }

  async getPublishedMonthlyScoreDistribution(
    actor: AuthenticatedUser,
    dateFrom: string,
    dateTo: string,
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
    const baseQuery = () =>
      this.reviewRepository
        .createQueryBuilder('review')
        .innerJoin(
          PerformancePeriod,
          'period',
          'period.id = review.performance_period_id AND period.company_id = review.company_id',
        )
        .leftJoin(
          PerformanceRatingBand,
          'band',
          'band.id = review.rating_band_id',
        )
        .where('review.company_id = :companyId', { companyId })
        .andWhere('review.status = :publishedStatus', {
          publishedStatus: PerformanceReviewStatusEnum.PUBLISHED,
        })
        .andWhere('period.period_type = :periodType', {
          periodType: PerformancePeriodTypeEnum.MONTHLY,
        })
        .andWhere('period.end_date >= :dateFrom', { dateFrom })
        .andWhere('period.start_date <= :dateTo', { dateTo });
    const scopedQuery = (query: ReturnType<typeof baseQuery>) => {
      return query
        .andWhere(`review.employee_id IN (${employeeScope.sql})`)
        .setParameters(employeeScope.params);
    };

    const [rows, lowPerformerCount] = await Promise.all([
      scopedQuery(baseQuery())
        .select('period.id', 'period_id')
        .addSelect('period.name', 'period_name')
        .addSelect('period.start_date', 'period_start')
        .addSelect('period.end_date', 'period_end')
        .addSelect('band.id', 'band_id')
        .addSelect('band.code', 'band_code')
        .addSelect('band.label', 'band_label')
        .addSelect('band.minimum_score', 'minimum_score')
        .addSelect('band.maximum_score', 'maximum_score')
        .addSelect('band.display_order', 'display_order')
        .addSelect(
          'band.requires_improvement_plan',
          'requires_improvement_plan',
        )
        .addSelect('COUNT(review.id)', 'published_review_count')
        .addSelect('COUNT(review.final_score)', 'scored_review_count')
        .addSelect('AVG(review.final_score)', 'average_score')
        .groupBy('period.id')
        .addGroupBy('period.name')
        .addGroupBy('period.start_date')
        .addGroupBy('period.end_date')
        .addGroupBy('band.id')
        .addGroupBy('band.code')
        .addGroupBy('band.label')
        .addGroupBy('band.minimum_score')
        .addGroupBy('band.maximum_score')
        .addGroupBy('band.display_order')
        .addGroupBy('band.requires_improvement_plan')
        .orderBy('period.start_date', 'ASC')
        .addOrderBy('band.display_order', 'ASC', 'NULLS LAST')
        .getRawMany<Record<string, string | number | boolean | null>>(),
      scopedQuery(baseQuery())
        .andWhere('band.requires_improvement_plan = TRUE')
        .andWhere('review.final_score IS NOT NULL')
        .select('COUNT(DISTINCT review.employee_id)', 'employee_count')
        .getRawOne<{ employee_count: string | number }>(),
    ]);

    const periods = new Map<
      number,
      {
        period_id: number;
        period_name: string;
        period_start: string;
        period_end: string;
        published_review_count: number;
        scored_review_count: number;
        unscored_review_count: number;
        unbanded_scored_review_count: number;
        bands: Array<Record<string, string | number | boolean | null>>;
      }
    >();

    for (const row of rows) {
      const periodId = Number(row.period_id);
      const period = periods.get(periodId) ?? {
        period_id: periodId,
        period_name: String(row.period_name),
        period_start: String(row.period_start),
        period_end: String(row.period_end),
        published_review_count: 0,
        scored_review_count: 0,
        unscored_review_count: 0,
        unbanded_scored_review_count: 0,
        bands: [],
      };
      const publishedCount = Number(row.published_review_count ?? 0);
      const scoredCount = Number(row.scored_review_count ?? 0);
      period.published_review_count += publishedCount;
      period.scored_review_count += scoredCount;
      period.unscored_review_count += publishedCount - scoredCount;

      if (row.band_id === null || row.band_id === undefined) {
        period.unbanded_scored_review_count += scoredCount;
      } else {
        period.bands.push({
          band_id: Number(row.band_id),
          code: String(row.band_code),
          label: String(row.band_label),
          minimum_score: Number(row.minimum_score),
          maximum_score: Number(row.maximum_score),
          requires_improvement_plan: row.requires_improvement_plan === true,
          published_review_count: publishedCount,
          scored_review_count: scoredCount,
          average_score:
            row.average_score === null ? null : Number(row.average_score),
        });
      }
      periods.set(periodId, period);
    }

    return {
      periods: [...periods.values()],
      low_performer_employee_count: Number(
        lowPerformerCount?.employee_count ?? 0,
      ),
    };
  }

  async getTopPerformers(
    actor: AuthenticatedUser,
    limit = 5,
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

    const latestPublishedReview = this.reviewRepository
      .createQueryBuilder('review')
      .innerJoin(
        Employee,
        'employee',
        'employee.id = review.employee_id AND employee.company_id = review.company_id',
      )
      .innerJoin(
        PerformancePeriod,
        'period',
        'period.id = review.performance_period_id AND period.company_id = review.company_id',
      )
      .select('review.employeeId', 'employee_id')
      .addSelect('employee.employee_no', 'employee_no')
      .addSelect(
        `CONCAT_WS(' ', employee.first_name, NULLIF(employee.middle_name, ''), employee.last_name)`,
        'full_name',
      )
      .addSelect('review.performancePeriodId', 'performance_period_id')
      .addSelect('review.finalScore', 'final_score')
      .addSelect('review.ratingCode', 'rating_code')
      .addSelect('review.publishedAt', 'published_at')
      .addSelect(
        'ROW_NUMBER() OVER (PARTITION BY review.employeeId ORDER BY review.publishedAt DESC, review.id DESC)',
        'employee_review_rank',
      )
      .where('review.companyId = :companyId', { companyId })
      .andWhere('review.status = :status', {
        status: PerformanceReviewStatusEnum.PUBLISHED,
      })
      .andWhere('review.finalScore IS NOT NULL');
    latestPublishedReview
      .andWhere(`review.employeeId IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);

    if (dateFrom) {
      latestPublishedReview.andWhere('period.endDate >= :dateFrom', {
        dateFrom,
      });
    }
    if (dateTo) {
      latestPublishedReview.andWhere('period.startDate <= :dateTo', {
        dateTo,
      });
    }

    const rankedReviewQuery = latestPublishedReview.getQuery();
    const rows = await this.reviewRepository
      .createQueryBuilder()
      .select('ranked.*')
      .from(`(${rankedReviewQuery})`, 'ranked')
      .setParameters(latestPublishedReview.getParameters())
      .where('ranked.employee_review_rank = 1')
      .orderBy('ranked.final_score', 'DESC')
      .addOrderBy('ranked.published_at', 'DESC')
      .addOrderBy('ranked.employee_id', 'ASC')
      .limit(Math.max(1, Math.min(limit, 20)))
      .getRawMany<{
        employee_id: number | string;
        employee_no: string | null;
        full_name: string | null;
        performance_period_id: number | string;
        final_score: string | null;
        rating_code: string | null;
        published_at: Date | string | null;
      }>();

    let previousScore: number | null = null;
    let previousRank = 0;
    return rows.map((row, index) => {
      const finalScore =
        row.final_score === null ? null : Number(row.final_score);
      const rank =
        finalScore !== null && finalScore === previousScore
          ? previousRank
          : index + 1;
      previousScore = finalScore;
      previousRank = rank;
      return {
        rank,
        employee_id: Number(row.employee_id),
        employee_no: row.employee_no,
        full_name: row.full_name,
        performance_period_id: Number(row.performance_period_id),
        final_score: finalScore,
        rating_code: row.rating_code,
        published_at: row.published_at,
      };
    });
  }
}
