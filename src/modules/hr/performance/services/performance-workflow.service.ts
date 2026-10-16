import { Company } from '../../../companies/entities/company.entity';
import { assertTransition } from '../utils/workflow-validation';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  CreatePerformanceWorkflowConfigDto,
  PerformanceWorkflowActionDto,
} from '../dto/performance-workflow.dto';
import { PerformancePeriodAssignment } from '../entities/performance-period-assignment.entity';
import {
  PerformanceReviewWorkflowStep,
  PerformanceReviewWorkflowStepStatusEnum,
} from '../entities/performance-review-workflow-step.entity';
import { PerformanceReview } from '../entities/performance-review.entity';
import {
  PerformanceWorkflowConfig,
  PerformanceWorkflowConfigStep,
} from '../entities/performance-workflow-config.entity';
import { PerformanceAuditActionEnum } from '../enums/performance-audit-action.enum';
import { PerformancePeriodAssignmentStatusEnum } from '../enums/performance-period-assignment-status.enum';
import { PerformanceReviewStatusEnum } from '../enums/performance-review-status.enum';
import { PerformanceWorkflowStepTypeEnum } from '../enums/performance-workflow-step-type.enum';
import { PerformanceAuditService } from './performance-audit.service';

type WorkflowActionResult = {
  completed: boolean;
  periodAssignmentId: number;
  review: PerformanceReview;
  steps: PerformanceReviewWorkflowStep[];
};

@Injectable()
export class PerformanceWorkflowService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly auditService: PerformanceAuditService,
    @InjectRepository(PerformanceWorkflowConfig)
    private readonly workflowRepository: Repository<PerformanceWorkflowConfig>,
    @InjectRepository(PerformanceReviewWorkflowStep)
    private readonly reviewStepRepository: Repository<PerformanceReviewWorkflowStep>,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
    @InjectRepository(PerformancePeriodAssignment)
    private readonly assignmentRepository: Repository<PerformancePeriodAssignment>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreatePerformanceWorkflowConfigDto,
  ): Promise<PerformanceWorkflowConfig> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const steps = this.normalizeSteps(dto.steps);
    this.validateSteps(steps);

    const saved = await this.workflowRepository.manager.transaction(
      async (manager) => {
        // Serialize default switches even when no default configuration exists yet.
        await manager.getRepository(Company).findOne({
          where: { id: companyId },
          lock: { mode: 'pessimistic_write' },
        });
        const repository = manager.getRepository(PerformanceWorkflowConfig);
        if (dto.is_default) {
          await repository.update(
            { companyId, isDefault: true },
            { isDefault: false },
          );
        }

        return await repository.save(
          repository.create({
            companyId,
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            description: dto.description?.trim() ?? null,
            isDefault: dto.is_default ?? false,
            status: 'ACTIVE',
            appliesToDepartmentId: dto.applies_to_department_id ?? null,
            appliesToPositionId: dto.applies_to_position_id ?? null,
            reviewType: dto.review_type?.trim() || null,
            steps,
            createdByCompanyUserId: actor.companyMembershipId ?? null,
          }),
        );
      },
    );

    await this.auditService.log({
      action: PerformanceAuditActionEnum.WORKFLOW_CONFIG_CREATED,
      actor,
      afterValues: this.configSnapshot(saved),
    });

    return saved;
  }

  async list(actor: AuthenticatedUser): Promise<PerformanceWorkflowConfig[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.workflowRepository.find({
      where: { companyId },
      order: { isDefault: 'DESC', id: 'DESC' },
    });
  }

  async initializeForReview(
    actor: AuthenticatedUser,
    review: PerformanceReview,
    assignment: PerformancePeriodAssignment,
    manager?: EntityManager,
  ): Promise<PerformanceReviewWorkflowStep[]> {
    const repository =
      manager?.getRepository(PerformanceReviewWorkflowStep) ??
      this.reviewStepRepository;
    const existing = await repository.find({
      where: { companyId: review.companyId, performanceReviewId: review.id },
      order: { sequenceNumber: 'ASC' },
    });

    if (existing.length) {
      if (
        existing.some((step) =>
          [
            PerformanceReviewWorkflowStepStatusEnum.RETURNED,
            PerformanceReviewWorkflowStepStatusEnum.REJECTED,
          ].includes(step.status),
        )
      ) {
        const reset = existing.map((step) => ({
          ...step,
          status: PerformanceReviewWorkflowStepStatusEnum.PENDING,
          actedByEmployeeId: null,
          actedByCompanyUserId: null,
          actionComment: null,
          actionAt: null,
          metadata: {
            ...(step.metadata ?? {}),
            reset_at: new Date().toISOString(),
            reset_by_company_user_id: actor.companyMembershipId ?? null,
          },
        }));
        return repository.save(reset);
      }
      return existing;
    }

    const config = await this.resolveActiveConfig(review.companyId, assignment);
    if (!config) {
      return [];
    }

    const assignees = await this.resolveStepAssignees(
      review.companyId,
      assignment,
    );
    const steps = config.steps
      .slice()
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
      .map((step) => {
        const assignee = assignees[step.type] ?? {
          employeeId: null,
          companyUserId: null,
        };
        return repository.create({
          companyId: review.companyId,
          performanceReviewId: review.id,
          periodAssignmentId: assignment.id,
          workflowConfigId: config.id,
          sequenceNumber: step.sequenceNumber,
          code: step.code,
          label: step.label,
          stepType: step.type,
          status: PerformanceReviewWorkflowStepStatusEnum.PENDING,
          assignedEmployeeId: assignee.employeeId,
          assignedCompanyUserId: assignee.companyUserId,
          metadata: {
            required: step.required,
            can_finalize: step.canFinalize,
            configuration: step.configuration ?? null,
          },
        });
      });

    return repository.save(steps);
  }

  async getReviewWorkflow(
    actor: AuthenticatedUser,
    reviewId: number,
  ): Promise<PerformanceReviewWorkflowStep[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    await this.requireReview(companyId, reviewId);
    return this.reviewStepRepository.find({
      where: { companyId, performanceReviewId: reviewId },
      order: { sequenceNumber: 'ASC' },
    });
  }

  async actOnCurrentStep(
    actor: AuthenticatedUser,
    reviewId: number,
    dto: PerformanceWorkflowActionDto,
  ): Promise<WorkflowActionResult> {
    return this.reviewRepository.manager.transaction(async (manager) => {
      const companyId = this.hrAccessService.ensureActorCompanyId(actor);
      let review = await this.requireReview(companyId, reviewId, manager);

      const assignment = await this.requireAssignment(
        companyId,
        review.periodAssignmentId,
        manager,
      );
      review = await this.requireReview(companyId, reviewId, manager);
      assertTransition(
        review.status,
        [
          PerformanceReviewStatusEnum.HR_REVIEW_PENDING,
          PerformanceReviewStatusEnum.MODERATION_PENDING,
          PerformanceReviewStatusEnum.REOPENED,
        ],
        'act on an approval workflow',
      );

      let steps = await manager
        .getRepository(PerformanceReviewWorkflowStep)
        .find({
          where: { companyId, performanceReviewId: review.id },
          order: { sequenceNumber: 'ASC' },
        });

      if (!steps.length) {
        steps = await this.initializeForReview(
          actor,
          review,
          assignment,
          manager,
        );
      }

      if (!steps.length) {
        throw new BadRequestException(
          'No active appraisal workflow configuration is available for this review.',
        );
      }

      const currentStep = steps.find(
        (step) =>
          step.status === PerformanceReviewWorkflowStepStatusEnum.PENDING,
      );

      if (!currentStep) {
        return {
          completed: true,
          periodAssignmentId: assignment.id,
          review,
          steps,
        };
      }

      this.assertCanActionStep(actor, currentStep);

      currentStep.actedByEmployeeId = actor.employeeId ?? null;
      currentStep.actedByCompanyUserId = actor.companyMembershipId ?? null;
      currentStep.actionComment = dto.comment?.trim() || null;
      currentStep.actionAt = new Date();

      if (dto.decision === 'RETURN') {
        currentStep.status = PerformanceReviewWorkflowStepStatusEnum.RETURNED;
        review.status = PerformanceReviewStatusEnum.MANAGER_REVIEW_PENDING;
        assignment.status =
          PerformancePeriodAssignmentStatusEnum.MANAGER_REVIEW;
        await manager
          .getRepository(PerformancePeriodAssignment)
          .save(assignment);
        await manager.getRepository(PerformanceReview).save(review);
      } else if (dto.decision === 'REJECT') {
        currentStep.status = PerformanceReviewWorkflowStepStatusEnum.REJECTED;
        review.status = PerformanceReviewStatusEnum.CANCELLED;
        await manager.getRepository(PerformanceReview).save(review);
      } else {
        currentStep.status = PerformanceReviewWorkflowStepStatusEnum.APPROVED;
      }

      await manager
        .getRepository(PerformanceReviewWorkflowStep)
        .save(currentStep);
      steps = await manager.getRepository(PerformanceReviewWorkflowStep).find({
        where: { companyId, performanceReviewId: review.id },
        order: { sequenceNumber: 'ASC' },
      });

      await this.auditService.log(
        {
          action: PerformanceAuditActionEnum.WORKFLOW_STEP_ACTIONED,
          actor,
          employeeId: review.employeeId,
          performanceReviewId: review.id,
          afterValues: {
            workflow_step_id: currentStep.id,
            code: currentStep.code,
            decision: dto.decision,
            status: currentStep.status,
          },
          reason: currentStep.actionComment,
        },
        manager,
      );

      return {
        completed:
          dto.decision === 'APPROVE' &&
          steps.every(
            (step) =>
              step.status ===
                PerformanceReviewWorkflowStepStatusEnum.APPROVED ||
              step.status === PerformanceReviewWorkflowStepStatusEnum.SKIPPED,
          ),
        periodAssignmentId: assignment.id,
        review,
        steps,
      };
    });
  }

  private async resolveActiveConfig(
    companyId: number,
    assignment: PerformancePeriodAssignment,
  ): Promise<PerformanceWorkflowConfig | null> {
    const employee = await this.employeeRepository.findOne({
      where: { id: assignment.employeeId, company_id: companyId },
    });
    const candidates = await this.workflowRepository.find({
      where: { companyId, status: 'ACTIVE' },
      order: { isDefault: 'DESC', id: 'DESC' },
    });

    return (
      candidates.find(
        (config) =>
          config.appliesToDepartmentId !== null &&
          config.appliesToDepartmentId === employee?.primary_department_id,
      ) ??
      candidates.find(
        (config) =>
          config.appliesToPositionId !== null &&
          config.appliesToPositionId === employee?.primary_position_id,
      ) ??
      candidates.find((config) => config.isDefault) ??
      candidates[0] ??
      null
    );
  }

  private async resolveStepAssignees(
    companyId: number,
    assignment: PerformancePeriodAssignment,
  ): Promise<
    Partial<
      Record<
        PerformanceWorkflowStepTypeEnum,
        { employeeId: number | null; companyUserId: number | null }
      >
    >
  > {
    const employee = await this.employeeRepository.findOne({
      where: { id: assignment.employeeId, company_id: companyId },
    });
    let departmentManager: Employee | null = null;

    if (employee?.primary_department_id) {
      const department = await this.departmentRepository.findOne({
        where: {
          id: employee.primary_department_id,
          company_id: companyId,
        },
      });
      if (department?.manager_employee_id) {
        departmentManager = await this.employeeRepository.findOne({
          where: {
            id: department.manager_employee_id,
            company_id: companyId,
          },
        });
      }
    }

    return {
      [PerformanceWorkflowStepTypeEnum.DIRECT_SUPERVISOR]: {
        employeeId: assignment.managerEmployeeId,
        companyUserId: assignment.managerCompanyUserId,
      },
      [PerformanceWorkflowStepTypeEnum.DEPARTMENT_MANAGER]: {
        employeeId: departmentManager?.id ?? null,
        companyUserId: departmentManager?.company_user_id ?? null,
      },
      [PerformanceWorkflowStepTypeEnum.HR_REVIEW]: {
        employeeId: null,
        companyUserId: null,
      },
      [PerformanceWorkflowStepTypeEnum.FINAL_APPROVAL]: {
        employeeId: null,
        companyUserId: null,
      },
      [PerformanceWorkflowStepTypeEnum.CUSTOM]: {
        employeeId: null,
        companyUserId: null,
      },
    };
  }

  private assertCanActionStep(
    actor: AuthenticatedUser,
    step: PerformanceReviewWorkflowStep,
  ) {
    if (this.hrAccessService.hasCompanyScope(actor)) {
      return;
    }

    if (
      step.assignedEmployeeId &&
      actor.employeeId === step.assignedEmployeeId
    ) {
      return;
    }

    throw new ForbiddenException(
      'Only the assigned approver or HR with company scope can action this workflow step.',
    );
  }

  private normalizeSteps(
    steps: CreatePerformanceWorkflowConfigDto['steps'],
  ): PerformanceWorkflowConfigStep[] {
    return steps
      .map((step) => ({
        code: step.code.trim().toUpperCase(),
        label: step.label.trim(),
        type: step.type,
        sequenceNumber: step.sequence_number,
        required: step.required ?? true,
        canFinalize: step.can_finalize ?? false,
        configuration: step.configuration ?? null,
      }))
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber);
  }

  private validateSteps(steps: PerformanceWorkflowConfigStep[]) {
    const codes = new Set<string>();
    const sequences = new Set<number>();

    for (const step of steps) {
      if (!step.code || !step.label) {
        throw new BadRequestException(
          'Each workflow step needs a code and label.',
        );
      }
      if (codes.has(step.code)) {
        throw new BadRequestException(
          `Duplicate workflow step code: ${step.code}.`,
        );
      }
      if (sequences.has(step.sequenceNumber)) {
        throw new BadRequestException(
          `Duplicate workflow sequence number: ${step.sequenceNumber}.`,
        );
      }
      codes.add(step.code);
      sequences.add(step.sequenceNumber);
    }

    if (!steps.some((step) => step.canFinalize)) {
      steps[steps.length - 1].canFinalize = true;
    }
  }

  private async requireReview(
    companyId: number,
    reviewId: number,
    manager?: EntityManager,
  ): Promise<PerformanceReview> {
    const review = await (
      manager?.getRepository(PerformanceReview) ?? this.reviewRepository
    ).findOne({
      where: { id: reviewId, companyId },
    });
    if (!review) {
      throw new NotFoundException('Performance review not found.');
    }
    return review;
  }

  private async requireAssignment(
    companyId: number,
    assignmentId: number,
    manager?: EntityManager,
  ): Promise<PerformancePeriodAssignment> {
    const assignment = await (
      manager?.getRepository(PerformancePeriodAssignment) ??
      this.assignmentRepository
    ).findOne({
      where: { id: assignmentId, companyId },
      ...(manager ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!assignment) {
      throw new NotFoundException('Performance period assignment not found.');
    }
    return assignment;
  }

  private configSnapshot(config: PerformanceWorkflowConfig) {
    return {
      id: config.id,
      code: config.code,
      name: config.name,
      is_default: config.isDefault,
      applies_to_department_id: config.appliesToDepartmentId,
      applies_to_position_id: config.appliesToPositionId,
      steps: config.steps,
      version: config.version,
    };
  }
}
