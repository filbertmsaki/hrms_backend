import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { PerformancePeriod } from '../entities/performance-period.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { KpiAchievementStatusEnum } from '../enums/kpi-achievement-status.enum';
import { PerformancePeriodStatusEnum } from '../enums/performance-period-status.enum';
import { PerformanceReviewStatusEnum } from '../enums/performance-review-status.enum';

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
  ) {}

  async getCompanySummary(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const [
      openPeriods,
      pendingManagerValidation,
      pendingHrApproval,
      publishedReviews,
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

    const [publishedReviews, pendingKpis, latestPublishedReview] =
      await Promise.all([
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
      ]);

    return {
      latest_published_score: latestPublishedReview?.finalScore ?? null,
      latest_rating_code: latestPublishedReview?.ratingCode ?? null,
      published_reviews: publishedReviews,
      pending_kpis: pendingKpis,
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

    const [pendingTeamValidations, publishedTeamReviews] = await Promise.all([
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
    ]);

    return {
      pending_team_validations: pendingTeamValidations,
      published_team_reviews: publishedTeamReviews,
    };
  }
}
