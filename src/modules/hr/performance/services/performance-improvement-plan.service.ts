import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { CreatePerformanceImprovementPlanDto } from '../dto/create-performance-improvement-plan.dto';
import { ReviewPerformanceImprovementMilestoneDto } from '../dto/review-performance-improvement-milestone.dto';
import { PerformanceImprovementMilestone } from '../entities/performance-improvement-milestone.entity';
import { PerformanceImprovementPlan } from '../entities/performance-improvement-plan.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformanceImprovementPlanStatusEnum } from '../enums/performance-improvement-plan-status.enum';
import { PerformanceAuditService } from './performance-audit.service';

@Injectable()
export class PerformanceImprovementPlanService {
  constructor(
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
    @InjectRepository(PerformanceImprovementPlan)
    private readonly pipRepository: Repository<PerformanceImprovementPlan>,
    @InjectRepository(PerformanceImprovementMilestone)
    private readonly milestoneRepository: Repository<PerformanceImprovementMilestone>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    performanceReviewId: number,
    dto: CreatePerformanceImprovementPlanDto,
  ): Promise<PerformanceImprovementPlan> {
    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required.');
    }

    const review = await this.reviewRepository.findOne({
      where: { id: performanceReviewId, companyId: actor.companyId },
    });

    if (!review) {
      throw new NotFoundException('Performance review not found.');
    }

    const existing = await this.pipRepository.findOne({
      where: { performanceReviewId, companyId: actor.companyId },
      relations: { milestones: true },
    });
    if (existing) {
      return existing;
    }

    const pip = await this.pipRepository.save(
      this.pipRepository.create({
        companyId: actor.companyId,
        performanceReviewId,
        employeeId: review.employeeId,
        managerEmployeeId: review.managerEmployeeId,
        status: PerformanceImprovementPlanStatusEnum.ACTIVE,
        summary: dto.summary.trim(),
        objectives: dto.objectives.map((item) => item.trim()),
        createdByCompanyUserId: actor.companyMembershipId ?? null,
        milestones: dto.milestones.map((milestone) => ({
          title: milestone.title.trim(),
          description: milestone.description?.trim() ?? null,
          dueDate: milestone.due_date,
        })),
      }),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.PIP_CREATED,
      actor,
      employeeId: review.employeeId,
      performanceReviewId: review.id,
      afterValues: {
        performance_improvement_plan_id: pip.id,
      },
    });

    return this.get(actor, pip.id);
  }

  async acknowledge(actor: AuthenticatedUser, planId: number) {
    if (!actor.companyId || !actor.employeeId) {
      throw new ForbiddenException('Employee company context is required.');
    }

    const pip = await this.pipRepository.findOne({
      where: { id: planId, companyId: actor.companyId },
    });

    if (!pip) {
      throw new NotFoundException('Performance improvement plan not found.');
    }

    if (pip.employeeId !== actor.employeeId) {
      throw new ForbiddenException(
        'You can acknowledge only your own performance improvement plan.',
      );
    }

    pip.employeeAcknowledgedAt = new Date();
    return this.pipRepository.save(pip);
  }

  async reviewMilestone(
    actor: AuthenticatedUser,
    milestoneId: number,
    dto: ReviewPerformanceImprovementMilestoneDto,
  ): Promise<PerformanceImprovementMilestone> {
    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required.');
    }

    const milestone = await this.milestoneRepository.findOne({
      where: { id: milestoneId },
      relations: { plan: true },
    });

    if (!milestone || milestone.plan.companyId !== actor.companyId) {
      throw new NotFoundException('Performance improvement milestone not found.');
    }

    milestone.status = dto.status;
    milestone.managerComment = dto.manager_comment?.trim() ?? null;
    milestone.reviewedAt = new Date();
    const saved = await this.milestoneRepository.save(milestone);

    await this.auditService.log({
      action: PerformanceAuditActionEnum.PIP_REVIEWED,
      actor,
      employeeId: milestone.plan.employeeId,
      performanceReviewId: milestone.plan.performanceReviewId,
      afterValues: {
        performance_improvement_milestone_id: saved.id,
        status: saved.status,
      },
    });

    return saved;
  }

  async close(
    actor: AuthenticatedUser,
    planId: number,
  ): Promise<PerformanceImprovementPlan> {
    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required.');
    }

    const pip = await this.pipRepository.findOne({
      where: { id: planId, companyId: actor.companyId },
      relations: { milestones: true },
    });

    if (!pip) {
      throw new NotFoundException('Performance improvement plan not found.');
    }

    pip.status = PerformanceImprovementPlanStatusEnum.CLOSED;
    pip.closedAt = new Date();
    const saved = await this.pipRepository.save(pip);

    await this.auditService.log({
      action: PerformanceAuditActionEnum.PIP_CLOSED,
      actor,
      employeeId: saved.employeeId,
      performanceReviewId: saved.performanceReviewId,
      afterValues: {
        performance_improvement_plan_id: saved.id,
        status: saved.status,
      },
    });

    return saved;
  }

  async list(actor: AuthenticatedUser): Promise<PerformanceImprovementPlan[]> {
    if (!actor.companyId) {
      return [];
    }

    const where =
      actor.employeeId && !actor.permissions.includes('performance_pip:read')
        ? { companyId: actor.companyId, employeeId: actor.employeeId }
        : { companyId: actor.companyId };

    return this.pipRepository.find({
      where,
      relations: { milestones: true },
      order: { id: 'DESC', milestones: { id: 'ASC' } },
    });
  }

  async get(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<PerformanceImprovementPlan> {
    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required.');
    }

    const pip = await this.pipRepository.findOne({
      where: { id, companyId: actor.companyId },
      relations: { milestones: true },
    });

    if (!pip) {
      throw new NotFoundException('Performance improvement plan not found.');
    }

    return pip;
  }
}
