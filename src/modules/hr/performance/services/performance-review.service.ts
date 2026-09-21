import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ModeratePerformanceReviewDto } from '../dto/moderate-performance-review.dto';
import { ReopenPerformanceReviewDto } from '../dto/reopen-performance-review.dto';
import { SubmitManagerReviewDto } from '../dto/submit-manager-review.dto';
import { SubmitPerformanceAppealDto } from '../dto/submit-performance-appeal.dto';
import { HrAccessService } from '../../shared/hr-access.service';
import { ApprovePerformanceReviewDto } from '../dto/approve-performance-review.dto';
import { SubmitSelfReviewDto } from '../dto/submit-self-review.dto';
import { KpiAchievement } from '../entities/kpi-achievement.entity';
import { PerformanceAppeal } from '../entities/performance-appeal.entity';
import { PerformanceReviewModeration } from '../entities/performance-review-moderation.entity';
import { PerformancePeriodAssignment } from '../entities/performance-period-assignment.entity';
import { PerformanceRatingScale } from '../entities/performance-rating-scale.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformanceAppealStatusEnum } from '../enums/performance-appeal-status.enum';
import { KpiAchievementStatusEnum } from '../enums/kpi-achievement-status.enum';
import { PerformancePeriodAssignmentStatusEnum } from '../enums/performance-period-assignment-status.enum';
import { PerformanceReviewStatusEnum } from '../enums/performance-review-status.enum';
import { PerformanceAuditService } from './performance-audit.service';
import { PerformanceCompetencyService } from './performance-competency.service';
import { PerformanceImprovementPlanService } from './performance-improvement-plan.service';
import { PerformanceScorecardService } from './performance-scorecard.service';
import { PerformanceWorkflowService } from './performance-workflow.service';

@Injectable()
export class PerformanceReviewService {
  constructor(
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    private readonly competencyService: PerformanceCompetencyService,
    private readonly improvementPlanService: PerformanceImprovementPlanService,
    private readonly scorecardService: PerformanceScorecardService,
    private readonly workflowService: PerformanceWorkflowService,
    @InjectRepository(KpiAchievement)
    private readonly achievementRepository: Repository<KpiAchievement>,
    @InjectRepository(PerformancePeriodAssignment)
    private readonly assignmentRepository: Repository<PerformancePeriodAssignment>,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
    @InjectRepository(PerformanceRatingScale)
    private readonly ratingScaleRepository: Repository<PerformanceRatingScale>,
    @InjectRepository(PerformanceReviewModeration)
    private readonly moderationRepository: Repository<PerformanceReviewModeration>,
    @InjectRepository(PerformanceAppeal)
    private readonly appealRepository: Repository<PerformanceAppeal>,
  ) {}

  async submitSelfReview(
    actor: AuthenticatedUser,
    periodAssignmentId: number,
    dto: SubmitSelfReviewDto,
  ): Promise<PerformanceReview> {
    if (!actor.employeeId || !actor.companyId) {
      throw new ForbiddenException('Employee company context is required.');
    }

    const assignment = await this.getAssignment(
      actor.companyId,
      periodAssignmentId,
    );

    if (assignment.employeeId !== actor.employeeId) {
      throw new ForbiddenException('You can review only your own performance.');
    }

    const review = await this.getOrCreateReview(assignment);
    review.employeeSelfReview = dto.review ?? null;
    review.status = PerformanceReviewStatusEnum.MANAGER_REVIEW_PENDING;
    assignment.status = PerformancePeriodAssignmentStatusEnum.MANAGER_REVIEW;

    await this.assignmentRepository.save(assignment);
    return this.reviewRepository.save(review);
  }

  async submitManagerReview(
    actor: AuthenticatedUser,
    periodAssignmentId: number,
    dto: SubmitManagerReviewDto,
  ): Promise<PerformanceReview> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const assignment = await this.getAssignment(companyId, periodAssignmentId);

    const managerHasAccess =
      actor.employeeId === assignment.managerEmployeeId ||
      this.hrAccessService.hasCompanyScope(actor);

    if (!managerHasAccess) {
      throw new ForbiddenException(
        'Only the assigned manager or HR with company scope can submit this review.',
      );
    }

    const review = await this.getOrCreateReview(assignment);

    if (dto.review && typeof dto.review.competency_template_id === 'number') {
      await this.competencyService.initializeRatingsForReview(
        companyId,
        review.id,
        dto.review.competency_template_id,
      );
    }

    if (dto.competency_ratings?.length) {
      const scored = await this.competencyService.scoreManagerRatings(
        companyId,
        review.id,
        dto.competency_ratings,
      );
      review.competencyScore = scored.competencyScore.toFixed(4);
    }

    review.managerReview = dto.review ?? null;
    review.areasOfStrength = dto.areas_of_strength ?? null;
    review.areasForImprovement = dto.areas_for_improvement ?? null;
    review.trainingNeeds = dto.training_needs ?? null;
    review.recommendations = dto.recommendations ?? null;
    review.status = PerformanceReviewStatusEnum.HR_REVIEW_PENDING;
    assignment.status = PerformancePeriodAssignmentStatusEnum.HR_REVIEW;

    const saved = await this.reviewRepository.save(review);
    await this.assignmentRepository.save(assignment);

    await this.auditService.log({
      action: PerformanceAuditActionEnum.MANAGER_REVIEW_SUBMITTED,
      actor,
      employeeId: assignment.employeeId,
      performanceReviewId: saved.id,
      afterValues: {
        performance_review_id: saved.id,
        competency_score: saved.competencyScore,
        status: saved.status,
      },
    });

    await this.workflowService.initializeForReview(actor, saved, assignment);

    return saved;
  }

  async approve(
    actor: AuthenticatedUser,
    periodAssignmentId: number,
    dto: ApprovePerformanceReviewDto,
  ): Promise<PerformanceReview> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const assignment = await this.getAssignment(companyId, periodAssignmentId);
    const achievements = await this.achievementRepository.find({
      where: { companyId, periodAssignmentId },
      order: { id: 'ASC' },
    });

    if (
      achievements.some(
        (achievement) =>
          achievement.status !== KpiAchievementStatusEnum.MANAGER_VALIDATED &&
          achievement.status !== KpiAchievementStatusEnum.HR_APPROVED &&
          achievement.status !== KpiAchievementStatusEnum.PUBLISHED,
      )
    ) {
      throw new BadRequestException(
        'All KPI achievements must be manager-validated before HR approval.',
      );
    }

    const review = await this.getOrCreateReview(assignment);
    const adjustmentScore =
      dto.adjustment_score ?? Number(review.adjustmentScore ?? 0);
    const scorecardCalculation =
      await this.scorecardService.calculateReviewScore({
        companyId,
        assignment,
        review,
        achievements,
        adjustmentScore,
      });

    review.kpiScore = scorecardCalculation.kpiScore;
    review.adjustmentScore = scorecardCalculation.adjustmentScore;
    review.competencyScore = scorecardCalculation.competencyScore;
    review.finalScore = scorecardCalculation.finalScore;
    review.hrReview = dto.hr_review ?? null;
    review.status = dto.publish
      ? PerformanceReviewStatusEnum.PUBLISHED
      : PerformanceReviewStatusEnum.APPROVED;
    review.calculationSnapshot = {
      ...scorecardCalculation.snapshot,
      achievement_ids: achievements.map((item) => item.id),
      achievement_scores: achievements.map((item) => ({
        id: item.id,
        raw_score: item.rawScore,
        capped_score: item.cappedScore,
        weighted_score: item.weightedScore,
      })),
      kpi_score: review.kpiScore,
      competency_score: review.competencyScore,
      adjustment_score: review.adjustmentScore,
      final_score: review.finalScore,
    };
    review.calculationHash = createHash('sha256')
      .update(JSON.stringify(review.calculationSnapshot))
      .digest('hex');

    const ratingScale = await this.ratingScaleRepository.findOne({
      where: { companyId, isDefault: true, status: 'ACTIVE' },
      relations: { bands: true },
    });

    if (ratingScale) {
      const finalScoreNumber = Number(review.finalScore);
      const matchingBand = ratingScale.bands.find(
        (band) =>
          finalScoreNumber >= Number(band.minimumScore) &&
          finalScoreNumber <= Number(band.maximumScore),
      );

      review.ratingScaleId = ratingScale.id;
      review.ratingBandId = matchingBand?.id ?? null;
      review.ratingCode = matchingBand?.code ?? null;
    }

    if (dto.publish) {
      review.publishedAt = new Date();
      review.appealDeadlineAt = this.resolveAppealDeadline();
      assignment.status = PerformancePeriodAssignmentStatusEnum.PUBLISHED;
      assignment.publishedAt = new Date();

      for (const achievement of achievements) {
        achievement.status = KpiAchievementStatusEnum.PUBLISHED;
        achievement.publishedAt = new Date();
      }

      await this.achievementRepository.save(achievements);
    } else {
      assignment.status = PerformancePeriodAssignmentStatusEnum.APPROVED;
      assignment.approvedAt = new Date();
    }

    await this.assignmentRepository.save(assignment);
    const saved = await this.reviewRepository.save(review);

    if (dto.publish && ratingScale) {
      const ratingBand = ratingScale.bands.find(
        (band) => band.id === saved.ratingBandId,
      );

      if (ratingBand?.requiresImprovementPlan) {
        await this.ensureImprovementPlanForReview(saved.id, actor);
      }
    }

    await this.auditService.log({
      action: dto.publish
        ? PerformanceAuditActionEnum.REVIEW_PUBLISHED
        : PerformanceAuditActionEnum.REVIEW_APPROVED,
      actor,
      employeeId: assignment.employeeId,
      performanceReviewId: saved.id,
      afterValues: {
        performance_review_id: saved.id,
        final_score: saved.finalScore,
        rating_code: saved.ratingCode,
        status: saved.status,
      },
    });

    return saved;
  }

  async moderate(
    actor: AuthenticatedUser,
    reviewId: number,
    dto: ModeratePerformanceReviewDto,
  ): Promise<PerformanceReview> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const review = await this.requireReview(companyId, reviewId);
    const beforeScore = review.finalScore;

    if (dto.final_score !== undefined) {
      review.finalScore = dto.final_score.toFixed(4);
      await this.applyRatingBand(companyId, review, dto.final_score);
    }

    review.moderationSnapshot = {
      ...(review.moderationSnapshot ?? {}),
      latest: {
        reason: dto.reason.trim(),
        snapshot: dto.snapshot ?? null,
        moderated_at: new Date().toISOString(),
      },
    };

    const saved = await this.reviewRepository.save(review);
    await this.moderationRepository.save(
      this.moderationRepository.create({
        companyId,
        performanceReviewId: review.id,
        moderatedByCompanyUserId: actor.companyMembershipId ?? null,
        previousFinalScore: beforeScore,
        newFinalScore: saved.finalScore,
        reason: dto.reason.trim(),
        snapshot: dto.snapshot ?? {},
      }),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.MODERATION_COMPLETED,
      actor,
      employeeId: saved.employeeId,
      performanceReviewId: saved.id,
      beforeValues: { final_score: beforeScore },
      afterValues: {
        final_score: saved.finalScore,
        rating_code: saved.ratingCode,
      },
      reason: dto.reason.trim(),
    });

    return saved;
  }

  async reopen(
    actor: AuthenticatedUser,
    reviewId: number,
    dto: ReopenPerformanceReviewDto,
  ): Promise<PerformanceReview> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const review = await this.requireReview(companyId, reviewId);

    if (!this.configService.get<boolean>('PERFORMANCE_ALLOW_REOPEN', false)) {
      throw new ConflictException('Performance review reopen is disabled.');
    }

    const assignment = await this.getAssignment(
      companyId,
      review.periodAssignmentId,
    );

    review.calculationSnapshot = {
      ...(review.calculationSnapshot ?? {}),
      previous_revision: {
        revision_number: review.revisionNumber,
        final_score: review.finalScore,
        rating_code: review.ratingCode,
        published_at: review.publishedAt?.toISOString() ?? null,
        reopen_reason: dto.reason.trim(),
      },
    };
    review.revisionNumber += 1;
    review.status = PerformanceReviewStatusEnum.REOPENED;
    review.publishedAt = null;
    review.lockedAt = null;
    review.appealDeadlineAt = null;
    assignment.status = PerformancePeriodAssignmentStatusEnum.HR_REVIEW;
    assignment.publishedAt = null;

    await this.assignmentRepository.save(assignment);
    const saved = await this.reviewRepository.save(review);

    await this.auditService.log({
      action: PerformanceAuditActionEnum.REVIEW_REOPENED,
      actor,
      employeeId: saved.employeeId,
      performanceReviewId: saved.id,
      afterValues: {
        revision_number: saved.revisionNumber,
        status: saved.status,
      },
      reason: dto.reason.trim(),
    });

    return saved;
  }

  async submitAppeal(
    actor: AuthenticatedUser,
    reviewId: number,
    dto: SubmitPerformanceAppealDto,
  ): Promise<PerformanceAppeal> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) {
      throw new ForbiddenException('Employee context is required.');
    }

    const review = await this.requireReview(companyId, reviewId);
    if (review.employeeId !== actor.employeeId) {
      throw new ForbiddenException(
        'You can appeal only your own performance review.',
      );
    }

    if (review.status !== PerformanceReviewStatusEnum.PUBLISHED) {
      throw new BadRequestException(
        'Only published performance reviews can be appealed.',
      );
    }

    if (
      review.appealDeadlineAt &&
      review.appealDeadlineAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'The appeal window for this performance review has expired.',
      );
    }

    const appeal = await this.appealRepository.save(
      this.appealRepository.create({
        companyId,
        performanceReviewId: review.id,
        employeeId: actor.employeeId,
        status: PerformanceAppealStatusEnum.SUBMITTED,
        reason: dto.reason.trim(),
        requestedChanges: dto.requested_changes ?? null,
      }),
    );

    review.status = PerformanceReviewStatusEnum.APPEALED;
    await this.reviewRepository.save(review);

    await this.auditService.log({
      action: PerformanceAuditActionEnum.REVIEW_APPEALED,
      actor,
      employeeId: review.employeeId,
      performanceReviewId: review.id,
      afterValues: { performance_appeal_id: appeal.id, status: appeal.status },
      reason: dto.reason.trim(),
    });

    return appeal;
  }

  async listForEmployee(
    actor: AuthenticatedUser,
    employeeId: number,
  ): Promise<PerformanceReview[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.reviewRepository.find({
      where: { companyId, employeeId },
      order: { id: 'DESC' },
    });
  }

  async listAppeals(actor: AuthenticatedUser): Promise<PerformanceAppeal[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.appealRepository.find({
      where: { companyId },
      order: { id: 'DESC' },
    });
  }

  private async getAssignment(
    companyId: number,
    id: number,
  ): Promise<PerformancePeriodAssignment> {
    const assignment = await this.assignmentRepository.findOne({
      where: { id, companyId },
    });

    if (!assignment) {
      throw new NotFoundException('Performance period assignment not found.');
    }

    return assignment;
  }

  private async getOrCreateReview(
    assignment: PerformancePeriodAssignment,
  ): Promise<PerformanceReview> {
    const existing = await this.reviewRepository.findOne({
      where: {
        companyId: assignment.companyId,
        performancePeriodId: assignment.performancePeriodId,
        employeeId: assignment.employeeId,
      },
    });

    if (existing) {
      return existing;
    }

    return this.reviewRepository.save(
      this.reviewRepository.create({
        companyId: assignment.companyId,
        performancePeriodId: assignment.performancePeriodId,
        periodAssignmentId: assignment.id,
        employeeId: assignment.employeeId,
        managerEmployeeId: assignment.managerEmployeeId,
        managerCompanyUserId: assignment.managerCompanyUserId,
        status: PerformanceReviewStatusEnum.DRAFT,
        adjustmentScore: '0.0000',
      }),
    );
  }

  private async requireReview(
    companyId: number,
    reviewId: number,
  ): Promise<PerformanceReview> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId, companyId },
    });

    if (!review) {
      throw new NotFoundException('Performance review not found.');
    }

    return review;
  }

  private async applyRatingBand(
    companyId: number,
    review: PerformanceReview,
    finalScore: number,
  ) {
    const ratingScale = await this.ratingScaleRepository.findOne({
      where: { companyId, isDefault: true, status: 'ACTIVE' },
      relations: { bands: true },
    });

    if (!ratingScale) {
      return;
    }

    const matchingBand = ratingScale.bands.find(
      (band) =>
        finalScore >= Number(band.minimumScore) &&
        finalScore <= Number(band.maximumScore),
    );

    review.ratingScaleId = ratingScale.id;
    review.ratingBandId = matchingBand?.id ?? null;
    review.ratingCode = matchingBand?.code ?? null;
  }

  private resolveAppealDeadline(): Date {
    const days = this.configService.get<number>(
      'PERFORMANCE_DEFAULT_APPEAL_DAYS',
      5,
    );
    const deadline = new Date();
    deadline.setUTCDate(deadline.getUTCDate() + days);
    return deadline;
  }

  private async ensureImprovementPlanForReview(
    reviewId: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
    try {
      await this.improvementPlanService.create(actor, reviewId, {
        summary: 'Auto-created from performance rating requiring improvement.',
        objectives: [
          'Address identified performance gaps',
          'Complete agreed development actions',
        ],
        milestones: [
          {
            title: 'Initial coaching review',
            due_date: new Date().toISOString().slice(0, 10),
          },
          {
            title: 'Follow-up progress review',
            due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10),
          },
        ],
      });
    } catch {
      // Best-effort creation to avoid blocking publication when a PIP already exists
      // or requires additional manual detail later.
    }
  }
}
