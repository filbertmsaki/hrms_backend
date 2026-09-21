import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  CarryForwardPerformanceDevelopmentGoalsDto,
  CreatePerformanceDevelopmentPlanDto,
  UpdatePerformanceDevelopmentGoalDto,
} from '../dto/performance-development-plan.dto';
import { PerformanceDevelopmentGoal } from '../entities/performance-development-goal.entity';
import { PerformanceDevelopmentPlan } from '../entities/performance-development-plan.entity';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformanceAuditService } from './performance-audit.service';

@Injectable()
export class PerformanceDevelopmentPlanService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(PerformanceDevelopmentPlan)
    private readonly planRepository: Repository<PerformanceDevelopmentPlan>,
    @InjectRepository(PerformanceDevelopmentGoal)
    private readonly goalRepository: Repository<PerformanceDevelopmentGoal>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreatePerformanceDevelopmentPlanDto,
  ): Promise<PerformanceDevelopmentPlan> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    this.assertCanManageEmployee(actor, dto.employee_id);

    const saved = await this.planRepository.save(
      this.planRepository.create({
        companyId,
        employeeId: dto.employee_id,
        managerEmployeeId: dto.manager_employee_id ?? null,
        sourceReviewId: dto.source_review_id ?? null,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? null,
        status: 'ACTIVE',
        startDate: dto.start_date ?? null,
        targetCompletionDate: dto.target_completion_date ?? null,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
        goals: dto.goals.map((goal) => ({
          companyId,
          title: goal.title.trim(),
          description: goal.description?.trim() ?? null,
          category: goal.category?.trim() ?? null,
          targetDate: goal.target_date ?? null,
          status: 'OPEN',
          progressPercent: 0,
          successMeasure: goal.success_measure?.trim() ?? null,
          supportRequired: goal.support_required?.trim() ?? null,
        })),
      }),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.DEVELOPMENT_PLAN_CREATED,
      actor,
      employeeId: saved.employeeId,
      performanceReviewId: saved.sourceReviewId,
      afterValues: {
        performance_development_plan_id: saved.id,
        goal_count: dto.goals.length,
      },
    });

    return this.get(actor, saved.id);
  }

  async list(actor: AuthenticatedUser): Promise<PerformanceDevelopmentPlan[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const where =
      actor.employeeId && !this.hrAccessService.hasCompanyScope(actor)
        ? { companyId, employeeId: actor.employeeId }
        : { companyId };

    return this.planRepository.find({
      where,
      relations: { goals: true },
      order: { id: 'DESC', goals: { id: 'ASC' } },
    });
  }

  async get(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<PerformanceDevelopmentPlan> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const plan = await this.planRepository.findOne({
      where: { id, companyId },
      relations: { goals: true },
      order: { goals: { id: 'ASC' } },
    });

    if (!plan) {
      throw new NotFoundException('Development plan not found.');
    }

    if (
      actor.employeeId &&
      !this.hrAccessService.hasCompanyScope(actor) &&
      plan.employeeId !== actor.employeeId
    ) {
      throw new ForbiddenException(
        'You can view only your own development plans.',
      );
    }

    return plan;
  }

  async updateGoal(
    actor: AuthenticatedUser,
    goalId: number,
    dto: UpdatePerformanceDevelopmentGoalDto,
  ): Promise<PerformanceDevelopmentGoal> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const goal = await this.goalRepository.findOne({
      where: { id: goalId, companyId },
      relations: { plan: true },
    });

    if (!goal) {
      throw new NotFoundException('Development goal not found.');
    }

    this.assertCanManageEmployee(actor, goal.plan.employeeId);
    if (dto.status) goal.status = dto.status.trim().toUpperCase();
    if (dto.progress_percent !== undefined) {
      goal.progressPercent = dto.progress_percent;
    }
    if (dto.employee_comment !== undefined) {
      goal.employeeComment = dto.employee_comment.trim() || null;
    }
    if (dto.manager_comment !== undefined) {
      goal.managerComment = dto.manager_comment.trim() || null;
    }
    if (goal.status === 'COMPLETED' && !goal.completedAt) {
      goal.completedAt = new Date();
      goal.progressPercent = 100;
    }

    const saved = await this.goalRepository.save(goal);
    await this.auditService.log({
      action: PerformanceAuditActionEnum.DEVELOPMENT_GOAL_UPDATED,
      actor,
      employeeId: goal.plan.employeeId,
      afterValues: {
        performance_development_goal_id: saved.id,
        status: saved.status,
        progress_percent: saved.progressPercent,
      },
    });

    return saved;
  }

  async carryForward(
    actor: AuthenticatedUser,
    dto: CarryForwardPerformanceDevelopmentGoalsDto,
  ): Promise<PerformanceDevelopmentPlan> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const goals = await this.goalRepository.find({
      where: { id: In(dto.goal_ids), companyId },
      relations: { plan: true },
      order: { id: 'ASC' },
    });
    if (!goals.length) {
      throw new NotFoundException(
        'No development goals found to carry forward.',
      );
    }

    const employeeId = goals[0].plan.employeeId;
    goals.forEach((goal) =>
      this.assertCanManageEmployee(actor, goal.plan.employeeId),
    );

    const plan = await this.planRepository.save(
      this.planRepository.create({
        companyId,
        employeeId,
        managerEmployeeId: goals[0].plan.managerEmployeeId,
        sourceReviewId: null,
        title: dto.title.trim(),
        description: 'Carried forward development goals.',
        status: 'ACTIVE',
        startDate: new Date().toISOString().slice(0, 10),
        targetCompletionDate: dto.target_completion_date ?? null,
        createdByCompanyUserId: actor.companyMembershipId ?? null,
        goals: goals.map((goal) => ({
          companyId,
          carryForwardFromGoalId: goal.id,
          title: goal.title,
          description: goal.description,
          category: goal.category,
          targetDate: dto.target_completion_date ?? goal.targetDate,
          status: 'OPEN',
          progressPercent: 0,
          successMeasure: goal.successMeasure,
          supportRequired: goal.supportRequired,
        })),
      }),
    );

    await this.goalRepository.save(
      goals.map((goal) => ({
        ...goal,
        status: goal.status === 'COMPLETED' ? goal.status : 'CARRIED_FORWARD',
      })),
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.DEVELOPMENT_GOAL_CARRIED_FORWARD,
      actor,
      employeeId,
      afterValues: {
        performance_development_plan_id: plan.id,
        source_goal_ids: goals.map((goal) => goal.id),
      },
    });

    return this.get(actor, plan.id);
  }

  private assertCanManageEmployee(
    actor: AuthenticatedUser,
    employeeId: number,
  ) {
    if (this.hrAccessService.hasCompanyScope(actor)) return;
    if (actor.employeeId === employeeId) return;
    throw new ForbiddenException(
      'You can manage only your own development plan without company scope.',
    );
  }
}
