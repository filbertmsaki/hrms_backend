import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  NotificationRecipient,
  OffboardingApprovalRequiredEvent,
  OffboardingApprovedEvent,
} from '../../notifications/events';
import {
  buildNotificationRecipient,
  HR_NOTIFICATION_ROLE_NAMES,
} from '../../notifications/notification-recipient.util';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../../companies/entities/company-user-role.entity';
import { Role } from '../../../roles/entities/role.entity';
import { EmployeePositionStatusEnum } from '../../employees/enums/employee-position-status.enum';
import { EmployeePosition } from '../../employees/entities/employee-position.entity';
import { OffboardingApprovalStatusEnum } from '../enums/offboarding-approval-status.enum';
import { OffboardingApproverTypeEnum } from '../enums/offboarding-approver-type.enum';
import { OffboardingRecordStatusEnum } from '../enums/offboarding-record-status.enum';
import { OffboardingRequestStatusEnum } from '../enums/offboarding-request-status.enum';
import { OffboardingApproval } from '../entities/offboarding-approval.entity';
import { OffboardingRequest } from '../entities/offboarding-request.entity';
import { OffboardingTask } from '../entities/offboarding-task.entity';
import { OffboardingWorkflowStep } from '../entities/offboarding-workflow-step.entity';
import { OffboardingWorkflow } from '../entities/offboarding-workflow.entity';

type WorkflowInitResult = {
  workflow: OffboardingWorkflow;
  steps: OffboardingWorkflowStep[];
  pending_approvals: number;
};

@Injectable()
export class OffboardingWorkflowService {
  constructor(
    @InjectRepository(OffboardingWorkflow)
    private readonly workflowRepository: Repository<OffboardingWorkflow>,
    @InjectRepository(OffboardingWorkflowStep)
    private readonly workflowStepRepository: Repository<OffboardingWorkflowStep>,
    @InjectRepository(OffboardingApproval)
    private readonly offboardingApprovalRepository: Repository<OffboardingApproval>,
    @InjectRepository(OffboardingRequest)
    private readonly offboardingRequestRepository: Repository<OffboardingRequest>,
    @InjectRepository(OffboardingTask)
    private readonly offboardingTaskRepository: Repository<OffboardingTask>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(CompanyUserRole)
    private readonly companyUserRoleRepository: Repository<CompanyUserRole>,
    @InjectRepository(EmployeePosition)
    private readonly employeePositionRepository: Repository<EmployeePosition>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(OffboardingWorkflowService.name);

  private getWorkflowRepository(
    manager?: EntityManager,
  ): Repository<OffboardingWorkflow> {
    return (
      manager?.getRepository(OffboardingWorkflow) ?? this.workflowRepository
    );
  }

  private getWorkflowStepRepository(
    manager?: EntityManager,
  ): Repository<OffboardingWorkflowStep> {
    return (
      manager?.getRepository(OffboardingWorkflowStep) ??
      this.workflowStepRepository
    );
  }

  private getApprovalRepository(
    manager?: EntityManager,
  ): Repository<OffboardingApproval> {
    return (
      manager?.getRepository(OffboardingApproval) ??
      this.offboardingApprovalRepository
    );
  }

  private getRequestRepository(
    manager?: EntityManager,
  ): Repository<OffboardingRequest> {
    return (
      manager?.getRepository(OffboardingRequest) ??
      this.offboardingRequestRepository
    );
  }

  private getTaskRepository(
    manager?: EntityManager,
  ): Repository<OffboardingTask> {
    return (
      manager?.getRepository(OffboardingTask) ?? this.offboardingTaskRepository
    );
  }

  private getCompanyUserRepository(
    manager?: EntityManager,
  ): Repository<CompanyUser> {
    return manager?.getRepository(CompanyUser) ?? this.companyUserRepository;
  }

  private getCompanyUserRoleRepository(
    manager?: EntityManager,
  ): Repository<CompanyUserRole> {
    return (
      manager?.getRepository(CompanyUserRole) ?? this.companyUserRoleRepository
    );
  }

  private getEmployeePositionRepository(
    manager?: EntityManager,
  ): Repository<EmployeePosition> {
    return (
      manager?.getRepository(EmployeePosition) ??
      this.employeePositionRepository
    );
  }

  private async resolveCompanyRoleRecipients(
    companyId: number,
    roleNames: readonly string[],
    manager?: EntityManager,
  ): Promise<NotificationRecipient[]> {
    const rows = await this.getCompanyUserRoleRepository(manager)
      .createQueryBuilder('assignment')
      .innerJoin(Role, 'role', 'role.id = assignment.role_id')
      .innerJoin(
        CompanyUser,
        'membership',
        'membership.id = assignment.company_user_id AND membership.company_id = :companyId AND membership.status = :status',
        { companyId, status: 'active' },
      )
      .innerJoin('membership.user', 'user')
      .where('role.company_id = :companyId', { companyId })
      .andWhere('role.name IN (:...roleNames)', { roleNames: [...roleNames] })
      .select([
        'user.first_name AS first_name',
        'user.last_name AS last_name',
        'user.email AS email',
      ])
      .groupBy('membership.id')
      .addGroupBy('user.first_name')
      .addGroupBy('user.last_name')
      .addGroupBy('user.email')
      .getRawMany<{
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>();

    return rows.flatMap((user) => {
      const recipient = buildNotificationRecipient(user);
      return recipient ? [recipient] : [];
    });
  }

  async resolveWorkflow(
    companyId: number,
    workflowId?: number | null,
    manager?: EntityManager,
  ): Promise<OffboardingWorkflow> {
    const repository = this.getWorkflowRepository(manager);

    let workflow: OffboardingWorkflow | null = null;
    if (workflowId) {
      workflow = await repository.findOne({
        where: {
          id: workflowId,
          company_id: companyId,
          status: OffboardingRecordStatusEnum.ACTIVE,
        },
      });
    }

    if (!workflow) {
      workflow = await repository.findOne({
        where: {
          company_id: companyId,
          is_default: true,
          status: OffboardingRecordStatusEnum.ACTIVE,
        },
      });
    }

    if (!workflow) {
      throw new NotFoundException(
        'No active offboarding workflow configured for this company',
      );
    }

    return workflow;
  }

  async resolveApproverMembershipIds(
    companyId: number,
    step: OffboardingWorkflowStep,
    manager?: EntityManager,
  ): Promise<number[]> {
    if (step.approver_type === OffboardingApproverTypeEnum.COMPANY_USER) {
      if (!step.company_user_id) {
        return [];
      }
      const membership = await this.getCompanyUserRepository(manager).findOne({
        where: {
          id: step.company_user_id,
          company_id: companyId,
          status: 'active',
        },
        select: ['id'],
      });
      return membership ? [membership.id] : [];
    }

    if (step.approver_type === OffboardingApproverTypeEnum.ROLE) {
      if (!step.role_id) {
        return [];
      }

      const assignments = await this.getCompanyUserRoleRepository(manager)
        .createQueryBuilder('assignment')
        .innerJoin(
          CompanyUser,
          'membership',
          'membership.id = assignment.company_user_id AND membership.company_id = :companyId AND membership.status = :status',
          { companyId, status: 'active' },
        )
        .where('assignment.role_id = :roleId', { roleId: step.role_id })
        .select('assignment.company_user_id', 'company_user_id')
        .groupBy('assignment.company_user_id')
        .getRawMany<{ company_user_id: number }>();

      return assignments.map((item) => Number(item.company_user_id));
    }

    if (!step.position_id) {
      return [];
    }

    const assignments = this.getEmployeePositionRepository(manager)
      .createQueryBuilder('employeePosition')
      .innerJoin('employeePosition.employee', 'employee')
      .innerJoin('employee.company_user', 'membership')
      .innerJoin('employeePosition.position', 'position')
      .where('employeePosition.company_id = :companyId', { companyId })
      .andWhere('employeePosition.position_id = :positionId', {
        positionId: step.position_id,
      })
      .andWhere('employeePosition.status = :assignmentStatus', {
        assignmentStatus: EmployeePositionStatusEnum.ACTIVE,
      })
      .andWhere(
        '(employeePosition.end_date IS NULL OR employeePosition.end_date >= CURDATE())',
      )
      .andWhere('membership.company_id = :companyId', { companyId })
      .andWhere('membership.status = :status', { status: 'active' })
      .select('membership.id', 'company_user_id')
      .groupBy('membership.id');

    if (step.assigned_branch_id) {
      assignments.andWhere(
        '(position.branch_id = :branchId OR employee.primary_branch_id = :branchId)',
        {
          branchId: step.assigned_branch_id,
        },
      );
    }

    if (step.assigned_department_id) {
      assignments.andWhere(
        '(position.department_id = :departmentId OR employee.primary_department_id = :departmentId)',
        { departmentId: step.assigned_department_id },
      );
    }

    const employees = await assignments.getRawMany<{
      company_user_id: number;
    }>();
    return employees.map((entry) => Number(entry.company_user_id));
  }

  async initializeForRequest(
    companyId: number,
    request: OffboardingRequest,
    workflowId?: number | null,
    manager?: EntityManager,
  ): Promise<WorkflowInitResult> {
    const workflow = await this.resolveWorkflow(companyId, workflowId, manager);
    const stepRepository = this.getWorkflowStepRepository(manager);
    const steps = await stepRepository.find({
      where: { workflow_id: workflow.id },
      order: { approval_level: 'ASC', id: 'ASC' },
    });

    if (!steps.length) {
      throw new BadRequestException(
        'Configured offboarding workflow has no approval steps',
      );
    }

    const approvalRepository = this.getApprovalRepository(manager);
    const taskRepository = this.getTaskRepository(manager);

    await approvalRepository.delete({ offboarding_request_id: request.id });
    await taskRepository.delete({ offboarding_request_id: request.id });

    let pendingApprovals = 0;

    for (const step of steps) {
      const membershipIds = await this.resolveApproverMembershipIds(
        companyId,
        step,
        manager,
      );

      await taskRepository.save(
        taskRepository.create({
          company_id: companyId,
          offboarding_request_id: request.id,
          workflow_step_id: step.id,
          assigned_to_company_user_id: membershipIds[0] ?? null,
          title: step.task_title,
          description: step.task_description,
          task_type: step.task_type,
          due_date:
            step.expected_duration_days && step.expected_duration_days > 0
              ? new Date(
                  Date.now() +
                    step.expected_duration_days * 24 * 60 * 60 * 1000,
                )
              : null,
          metadata: {
            approval_level: step.approval_level,
            action_type: step.action_type,
          },
        }),
      );

      if (!membershipIds.length) {
        if (step.is_required) {
          throw new BadRequestException(
            `Required offboarding workflow step at level ${step.approval_level} has no eligible approver`,
          );
        }

        await approvalRepository.save(
          approvalRepository.create({
            offboarding_request_id: request.id,
            workflow_step_id: step.id,
            approver_company_user_id: null,
            status: OffboardingApprovalStatusEnum.SKIPPED,
            comments:
              'Skipped automatically because no eligible approver was resolved',
            acted_at: new Date(),
          }),
        );
        continue;
      }

      pendingApprovals += membershipIds.length;
      await approvalRepository.save(
        membershipIds.map((membershipId) =>
          approvalRepository.create({
            offboarding_request_id: request.id,
            workflow_step_id: step.id,
            approver_company_user_id: membershipId,
            status: OffboardingApprovalStatusEnum.PENDING,
          }),
        ),
      );
    }

    request.workflow_id = workflow.id;
    request.status = pendingApprovals
      ? OffboardingRequestStatusEnum.WAITING_APPROVAL
      : OffboardingRequestStatusEnum.IN_PROGRESS;

    await this.getRequestRepository(manager).save(request);
    return { workflow, steps, pending_approvals: pendingApprovals };
  }

  async applyApprovalAction(
    offboardingRequestId: number,
    companyUserId: number,
    payload: {
      approve: boolean;
      comments?: string;
    },
    manager?: EntityManager,
  ): Promise<OffboardingRequest> {
    const requestRepository = this.getRequestRepository(manager);
    const approvalRepository = this.getApprovalRepository(manager);

    const request = await requestRepository.findOne({
      where: { id: offboardingRequestId },
      relations: {
        approvals: { workflow_step: true },
      },
    });

    if (!request) {
      throw new NotFoundException('Offboarding request not found');
    }

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Offboarding request is already closed');
    }

    const pendingApprovals = request.approvals
      .filter(
        (approval) => approval.status === OffboardingApprovalStatusEnum.PENDING,
      )
      .sort(
        (left, right) =>
          (left.workflow_step?.approval_level ?? Number.MAX_SAFE_INTEGER) -
          (right.workflow_step?.approval_level ?? Number.MAX_SAFE_INTEGER),
      );

    if (!pendingApprovals.length) {
      throw new BadRequestException(
        'No pending approval for this offboarding request',
      );
    }

    const currentLevel = pendingApprovals[0].workflow_step?.approval_level ?? 0;
    const levelApprovals = pendingApprovals.filter(
      (approval) =>
        (approval.workflow_step?.approval_level ?? 0) === currentLevel,
    );

    const actorApproval = levelApprovals.find(
      (approval) => approval.approver_company_user_id === companyUserId,
    );

    if (!actorApproval) {
      throw new ForbiddenException(
        'You are not assigned as approver at the current level',
      );
    }

    actorApproval.status = payload.approve
      ? OffboardingApprovalStatusEnum.APPROVED
      : OffboardingApprovalStatusEnum.REJECTED;
    actorApproval.comments = payload.comments?.trim() || null;
    actorApproval.acted_at = new Date();
    await approvalRepository.save(actorApproval);

    const otherLevelApprovals = levelApprovals.filter(
      (approval) => approval.id !== actorApproval.id,
    );
    if (otherLevelApprovals.length) {
      otherLevelApprovals.forEach((approval) => {
        approval.status = OffboardingApprovalStatusEnum.SKIPPED;
        approval.comments =
          approval.comments ??
          'Skipped because level already decided by another approver';
        approval.acted_at = new Date();
      });
      await approvalRepository.save(otherLevelApprovals);
    }

    if (!payload.approve) {
      request.status = OffboardingRequestStatusEnum.REJECTED;
      const futurePending = request.approvals.filter(
        (approval) => approval.status === OffboardingApprovalStatusEnum.PENDING,
      );
      if (futurePending.length) {
        futurePending.forEach((approval) => {
          approval.status = OffboardingApprovalStatusEnum.SKIPPED;
          approval.comments =
            approval.comments ?? 'Skipped after offboarding rejection';
          approval.acted_at = new Date();
        });
        await approvalRepository.save(futurePending);
      }
      const saved = await requestRepository.save(request);
      this.emitOffboardingOutcome(saved, manager).catch((e) =>
        this.logger.error('Offboarding rejected emit failed', e),
      );
      return saved;
    }

    const stillPending = await approvalRepository.find({
      where: {
        offboarding_request_id: offboardingRequestId,
        status: OffboardingApprovalStatusEnum.PENDING,
      },
    });

    request.status = stillPending.length
      ? OffboardingRequestStatusEnum.WAITING_APPROVAL
      : OffboardingRequestStatusEnum.APPROVED;

    const saved = await requestRepository.save(request);
    this.emitOffboardingOutcome(saved, manager).catch((e) =>
      this.logger.error('Offboarding outcome emit failed', e),
    );
    return saved;
  }

  async closeAllPendingApprovals(
    offboardingRequestId: number,
    comment: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getApprovalRepository(manager);
    const pending = await repository.find({
      where: {
        offboarding_request_id: offboardingRequestId,
        status: In([OffboardingApprovalStatusEnum.PENDING]),
      },
    });

    if (!pending.length) {
      return;
    }

    pending.forEach((approval) => {
      approval.status = OffboardingApprovalStatusEnum.SKIPPED;
      approval.comments = comment;
      approval.acted_at = new Date();
    });

    await repository.save(pending);
  }

  private async emitOffboardingOutcome(
    request: OffboardingRequest,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.getRequestRepository(manager);
    const loaded = await repo.findOne({
      where: { id: request.id },
      relations: {
        employee: { company_user: { user: true } },
      },
    });
    if (!loaded?.employee?.company_user?.user?.email) return;

    const employee = loaded.employee;
    const employeeName = `${employee.first_name} ${employee.last_name}`;
    const employeeEmail = employee.company_user.user.email;
    const frontendUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      'http://localhost:5173';
    const exitDate = loaded.last_working_date ?? null;

    if (loaded.status === OffboardingRequestStatusEnum.APPROVED) {
      this.eventEmitter.emit(
        OffboardingApprovedEvent.EVENT,
        new OffboardingApprovedEvent(
          employeeName,
          employeeEmail,
          exitDate,
          await this.resolveCompanyRoleRecipients(
            loaded.company_id,
            HR_NOTIFICATION_ROLE_NAMES,
            manager,
          ),
          `${frontendUrl}/offboarding/${request.id}`,
        ),
      );
      return;
    }

    if (loaded.status === OffboardingRequestStatusEnum.WAITING_APPROVAL) {
      const approvalRepo = this.getApprovalRepository(manager);
      const nextApprovals = await approvalRepo.find({
        where: {
          offboarding_request_id: loaded.id,
          status: OffboardingApprovalStatusEnum.PENDING,
        },
        relations: {
          approver_company_user: { user: true },
          workflow_step: true,
        },
        order: { id: 'ASC' },
      });
      const nextLevel = nextApprovals[0]?.workflow_step?.approval_level;
      const approvers: NotificationRecipient[] = nextApprovals
        .filter(
          (approval) =>
            nextLevel === undefined ||
            approval.workflow_step?.approval_level === nextLevel,
        )
        .flatMap((approval) => {
          const recipient = buildNotificationRecipient(
            approval.approver_company_user?.user,
          );
          return recipient ? [recipient] : [];
        });
      if (approvers.length) {
        this.eventEmitter.emit(
          OffboardingApprovalRequiredEvent.EVENT,
          new OffboardingApprovalRequiredEvent(
            employeeName,
            exitDate,
            approvers,
            `${frontendUrl}/offboarding/${request.id}/review`,
          ),
        );
      }
    }
  }
}
