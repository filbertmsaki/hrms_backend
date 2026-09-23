import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
  ) {}

  async getCompanySummary(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
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
      this.achievementRepository.count({
        where: {
          companyId,
          status: KpiAchievementStatusEnum.EMPLOYEE_SUBMITTED,
        },
      }),
      this.achievementRepository.count({
        where: {
          companyId,
          status: KpiAchievementStatusEnum.MANAGER_VALIDATED,
        },
      }),
      this.reviewRepository.count({
        where: {
          companyId,
          status: PerformanceReviewStatusEnum.PUBLISHED,
        },
      }),
      this.employeeKpiRepository.count({
        where: {
          companyId,
          status: In([
            EmployeeKpiStatusEnum.SUBMITTED,
            EmployeeKpiStatusEnum.RESUBMITTED,
            EmployeeKpiStatusEnum.PENDING_REVIEW,
          ]),
        },
      }),
      this.employeeKpiRepository.count({
        where: { companyId, status: EmployeeKpiStatusEnum.APPROVED },
      }),
      this.developmentPlanRepository.count({
        where: { companyId, status: 'ACTIVE' },
      }),
      this.pipRepository.count({
        where: { companyId, status: In(['ACTIVE', 'DRAFT']) },
      }),
      this.feedback360Repository.count({
        where: { companyId, status: PerformanceFeedback360StatusEnum.PENDING },
      }),
    ]);

    const finalScoreRow = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.finalScore)', 'average_score')
      .where('review.company_id = :companyId', { companyId })
      .andWhere('review.status = :status', {
        status: PerformanceReviewStatusEnum.PUBLISHED,
      })
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
      average_published_score: Number(
        Number(finalScoreRow?.average_score ?? 0).toFixed(2),
      ),
    };
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

  async getManagerSummary(actor: AuthenticatedUser) {
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
      this.reviewRepository.count({
        where: {
          companyId,
          managerEmployeeId: actor.employeeId,
          status: PerformanceReviewStatusEnum.PUBLISHED,
        },
      }),
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

  async getTopPerformers(
    actor: AuthenticatedUser,
    employeeIds: number[],
    limit = 5,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (employeeIds.length === 0) {
      return [];
    }

    const rows = await this.reviewRepository
      .createQueryBuilder('review')
      .innerJoin(
        Employee,
        'employee',
        'employee.id = review.employee_id AND employee.company_id = review.company_id',
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
      .where('review.companyId = :companyId', { companyId })
      .andWhere('review.employeeId IN (:...employeeIds)', { employeeIds })
      .andWhere('review.status = :status', {
        status: PerformanceReviewStatusEnum.PUBLISHED,
      })
      .andWhere('review.finalScore IS NOT NULL')
      .orderBy('review.finalScore', 'DESC')
      .addOrderBy('review.publishedAt', 'DESC')
      .addOrderBy('review.id', 'DESC')
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

    return rows.map((row, index) => ({
      rank: index + 1,
      employee_id: Number(row.employee_id),
      employee_no: row.employee_no,
      full_name: row.full_name,
      performance_period_id: Number(row.performance_period_id),
      final_score: row.final_score === null ? null : Number(row.final_score),
      rating_code: row.rating_code,
      published_at: row.published_at,
    }));
  }
}
