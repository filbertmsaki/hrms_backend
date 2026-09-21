import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { CreatePerformanceFeedback360RequestDto } from '../dto/create-performance-feedback-360-request.dto';
import { DeclinePerformanceFeedback360Dto } from '../dto/decline-performance-feedback-360.dto';
import { SubmitPerformanceFeedback360Dto } from '../dto/submit-performance-feedback-360.dto';
import { PerformanceFeedback360Request } from '../entities/performance-feedback-360-request.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformanceFeedback360StatusEnum } from '../enums/performance-feedback-360-status.enum';
import { PerformanceAuditService } from './performance-audit.service';

@Injectable()
export class PerformanceFeedback360Service {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
    @InjectRepository(PerformanceFeedback360Request)
    private readonly feedbackRepository: Repository<PerformanceFeedback360Request>,
  ) {}

  async invite(
    actor: AuthenticatedUser,
    performanceReviewId: number,
    dto: CreatePerformanceFeedback360RequestDto,
  ): Promise<PerformanceFeedback360Request[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    const review = await this.reviewRepository.findOne({
      where: { id: performanceReviewId, companyId },
    });
    if (!review) {
      throw new NotFoundException('Performance review not found.');
    }

    const raterIds = dto.invitations.map((item) => item.rater_employee_id);
    if (raterIds.includes(review.employeeId)) {
      throw new BadRequestException(
        'An employee cannot be invited to give 360 feedback on their own review.',
      );
    }
    if (new Set(raterIds).size !== raterIds.length) {
      throw new BadRequestException(
        'Each rater can only be invited once per review.',
      );
    }

    const existing = await this.feedbackRepository.find({
      where: { performanceReviewId, companyId },
    });
    const existingRaterIds = new Set(
      existing.map((item) => item.raterEmployeeId),
    );
    const toCreate = dto.invitations.filter(
      (item) => !existingRaterIds.has(item.rater_employee_id),
    );

    const created = await this.feedbackRepository.save(
      toCreate.map((invitation) =>
        this.feedbackRepository.create({
          companyId,
          performanceReviewId,
          subjectEmployeeId: review.employeeId,
          raterEmployeeId: invitation.rater_employee_id,
          relationshipType: invitation.relationship_type,
          dueDate: invitation.due_date ?? null,
          isAnonymous: invitation.is_anonymous ?? true,
          status: PerformanceFeedback360StatusEnum.PENDING,
          invitedByCompanyUserId: actor.companyMembershipId ?? null,
        }),
      ),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.FEEDBACK_360_INVITED,
      actor,
      employeeId: review.employeeId,
      performanceReviewId: review.id,
      afterValues: {
        invited_count: created.length,
        rater_employee_ids: created.map((item) => item.raterEmployeeId),
      },
    });

    return this.listForReview(actor, performanceReviewId);
  }

  async listForReview(
    actor: AuthenticatedUser,
    performanceReviewId: number,
  ): Promise<PerformanceFeedback360Request[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.feedbackRepository.find({
      where: { companyId, performanceReviewId },
      order: { id: 'ASC' },
    });
  }

  async getSummaryForReview(
    actor: AuthenticatedUser,
    performanceReviewId: number,
  ) {
    const requests = await this.listForReview(actor, performanceReviewId);
    const submitted = requests.filter(
      (item) => item.status === PerformanceFeedback360StatusEnum.SUBMITTED,
    );

    const byRelationship: Record<
      string,
      { count: number; average_score: string | null }
    > = {};
    for (const relationship of new Set(
      requests.map((item) => item.relationshipType),
    )) {
      const items = submitted.filter(
        (item) => item.relationshipType === relationship,
      );
      byRelationship[relationship] = {
        count: items.length,
        average_score: this.average(items),
      };
    }

    return {
      performance_review_id: performanceReviewId,
      total_invited: requests.length,
      total_submitted: submitted.length,
      total_pending: requests.filter(
        (item) => item.status === PerformanceFeedback360StatusEnum.PENDING,
      ).length,
      total_declined: requests.filter(
        (item) => item.status === PerformanceFeedback360StatusEnum.DECLINED,
      ).length,
      overall_average_score: this.average(submitted),
      by_relationship: byRelationship,
    };
  }

  async listAssignedToMe(
    actor: AuthenticatedUser,
  ): Promise<PerformanceFeedback360Request[]> {
    if (!actor.companyId || !actor.employeeId) {
      return [];
    }
    return this.feedbackRepository.find({
      where: { companyId: actor.companyId, raterEmployeeId: actor.employeeId },
      order: { status: 'ASC', id: 'DESC' },
    });
  }

  async submit(
    actor: AuthenticatedUser,
    requestId: number,
    dto: SubmitPerformanceFeedback360Dto,
  ): Promise<PerformanceFeedback360Request> {
    const request = await this.getOwnRequest(actor, requestId);

    if (request.status !== PerformanceFeedback360StatusEnum.PENDING) {
      throw new BadRequestException(
        'This 360 feedback request has already been resolved.',
      );
    }

    request.status = PerformanceFeedback360StatusEnum.SUBMITTED;
    request.ratings = dto.ratings;
    request.overallScore = new Decimal(dto.overall_score)
      .toDecimalPlaces(2)
      .toFixed(2);
    request.strengths = dto.strengths?.trim() ?? null;
    request.improvementAreas = dto.improvement_areas?.trim() ?? null;
    request.comments = dto.comments?.trim() ?? null;
    request.submittedAt = new Date();
    const saved = await this.feedbackRepository.save(request);

    await this.auditService.log({
      action: PerformanceAuditActionEnum.FEEDBACK_360_SUBMITTED,
      actor,
      employeeId: saved.subjectEmployeeId,
      performanceReviewId: saved.performanceReviewId,
      afterValues: {
        performance_feedback_360_request_id: saved.id,
        relationship_type: saved.relationshipType,
      },
    });

    return saved;
  }

  async decline(
    actor: AuthenticatedUser,
    requestId: number,
    dto: DeclinePerformanceFeedback360Dto,
  ): Promise<PerformanceFeedback360Request> {
    const request = await this.getOwnRequest(actor, requestId);

    if (request.status !== PerformanceFeedback360StatusEnum.PENDING) {
      throw new BadRequestException(
        'This 360 feedback request has already been resolved.',
      );
    }

    request.status = PerformanceFeedback360StatusEnum.DECLINED;
    request.declineReason = dto.reason?.trim() ?? null;
    const saved = await this.feedbackRepository.save(request);

    await this.auditService.log({
      action: PerformanceAuditActionEnum.FEEDBACK_360_DECLINED,
      actor,
      employeeId: saved.subjectEmployeeId,
      performanceReviewId: saved.performanceReviewId,
      afterValues: {
        performance_feedback_360_request_id: saved.id,
      },
    });

    return saved;
  }

  private async getOwnRequest(
    actor: AuthenticatedUser,
    requestId: number,
  ): Promise<PerformanceFeedback360Request> {
    if (!actor.companyId || !actor.employeeId) {
      throw new ForbiddenException('Employee company context is required.');
    }

    const request = await this.feedbackRepository.findOne({
      where: { id: requestId, companyId: actor.companyId },
    });

    if (!request) {
      throw new NotFoundException('360 feedback request not found.');
    }
    if (request.raterEmployeeId !== actor.employeeId) {
      throw new ForbiddenException(
        'You can only respond to 360 feedback requests assigned to you.',
      );
    }

    return request;
  }

  private average(items: PerformanceFeedback360Request[]): string | null {
    if (!items.length) return null;
    const total = items.reduce(
      (sum, item) => sum.plus(item.overallScore ?? 0),
      new Decimal(0),
    );
    return total.div(items.length).toDecimalPlaces(2).toFixed(2);
  }
}
