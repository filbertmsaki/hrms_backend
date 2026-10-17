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
  OnboardingApprovalRequiredEvent,
  OnboardingApprovedEvent,
  OnboardingRejectedEvent,
} from '../../notifications/events';
import {
  buildNotificationRecipient,
  HR_NOTIFICATION_ROLE_NAMES,
} from '../../notifications/notification-recipient.util';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../../companies/entities/company-user-role.entity';
import { Role } from '../../../roles/entities/role.entity';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeDepartment } from '../../employees/entities/employee-department.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { OnboardingApprovalStatusEnum } from '../enums/onboarding-approval-status.enum';
import { OnboardingRecordStatusEnum } from '../enums/onboarding-record-status.enum';
import { OnboardingRequestStatusEnum } from '../enums/onboarding-request-status.enum';
import { OnboardingApproval } from '../entities/onboarding-approval.entity';
import { OnboardingRequest } from '../entities/onboarding-request.entity';
import { OnboardingWorkflowStep } from '../entities/onboarding-workflow-step.entity';
import { OnboardingWorkflow } from '../entities/onboarding-workflow.entity';
import { OnboardingStepTypeEnum } from '../enums/onboarding-step-type.enum';

type WorkflowInitResult = {
  workflow: OnboardingWorkflow;
  initialLevel: number;
  steps: OnboardingWorkflowStep[];
};

export type OnboardingApproverFailure = Pick<
  OnboardingWorkflowStep,
  | 'id'
  | 'step_order'
  | 'name'
  | 'assigned_user_id'
  | 'assigned_role_id'
  | 'assigned_department_id'
>;

type WorkflowApproverPlan = {
  assignments: { step: OnboardingWorkflowStep; membershipIds: number[] }[];
  failures: OnboardingApproverFailure[];
};

@Injectable()
export class OnboardingWorkflowService {
  constructor(
    @InjectRepository(OnboardingWorkflow)
    private readonly workflowRepository: Repository<OnboardingWorkflow>,
    @InjectRepository(OnboardingWorkflowStep)
    private readonly workflowStepRepository: Repository<OnboardingWorkflowStep>,
    @InjectRepository(OnboardingApproval)
    private readonly onboardingApprovalRepository: Repository<OnboardingApproval>,
    @InjectRepository(OnboardingRequest)
    private readonly onboardingRequestRepository: Repository<OnboardingRequest>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(CompanyUserRole)
    private readonly companyUserRoleRepository: Repository<CompanyUserRole>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(OnboardingWorkflowService.name);

  private repo<T extends object>(
    entity: new () => T,
    manager?: EntityManager,
  ): Repository<T> {
    return manager?.getRepository(entity) ?? this.getDefaultRepo(entity);
  }

  private getDefaultRepo<T extends object>(entity: new () => T): Repository<T> {
    const map = new Map<new () => object, Repository<any>>([
      [OnboardingWorkflow, this.workflowRepository],
      [OnboardingWorkflowStep, this.workflowStepRepository],
      [OnboardingApproval, this.onboardingApprovalRepository],
      [OnboardingRequest, this.onboardingRequestRepository],
      [CompanyUser, this.companyUserRepository],
      [CompanyUserRole, this.companyUserRoleRepository],
    ]);
    return map.get(entity) as Repository<T>;
  }

  private async resolveCompanyRoleRecipients(
    companyId: number,
    roleNames: readonly string[],
    manager?: EntityManager,
  ): Promise<NotificationRecipient[]> {
    const rows = await this.repo(CompanyUserRole, manager)
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
        'membership.id AS company_user_id',
        'user.first_name AS first_name',
        'user.last_name AS last_name',
        'user.email AS email',
      ])
      .groupBy('membership.id')
      .addGroupBy('user.first_name')
      .addGroupBy('user.last_name')
      .addGroupBy('user.email')
      .getRawMany<{
        company_user_id: number;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>();

    return rows.flatMap((user) => {
      const recipient = buildNotificationRecipient(user, {
        companyUserId: user.company_user_id,
      });
      return recipient ? [recipient] : [];
    });
  }

  async resolveWorkflow(
    companyId: number,
    workflowId?: number | null,
    manager?: EntityManager,
  ): Promise<OnboardingWorkflow> {
    const repository = this.repo(OnboardingWorkflow, manager);

    let workflow: OnboardingWorkflow | null = null;
    if (workflowId) {
      workflow = await repository.findOne({
        where: {
          id: workflowId,
          company_id: companyId,
          status: OnboardingRecordStatusEnum.ACTIVE,
        },
      });
    }

    if (!workflow) {
      workflow = await repository.findOne({
        where: {
          company_id: companyId,
          is_default: true,
          status: OnboardingRecordStatusEnum.ACTIVE,
        },
      });
    }

    if (!workflow) {
      throw new NotFoundException(
        'No active onboarding workflow configured for this company',
      );
    }

    return workflow;
  }

  async resolveApproverMembershipIds(
    companyId: number,
    step: OnboardingWorkflowStep,
    manager?: EntityManager,
  ): Promise<number[]> {
    if (step.assigned_user_id) {
      const membership = await this.repo(CompanyUser, manager).findOne({
        where: {
          id: step.assigned_user_id,
          company_id: companyId,
          status: 'active',
        },
        select: ['id'],
      });
      if (membership) return [membership.id];
    }

    if (step.assigned_role_id) {
      const assignments = await this.repo(CompanyUserRole, manager)
        .createQueryBuilder('assignment')
        .innerJoin(
          CompanyUser,
          'membership',
          'membership.id = assignment.company_user_id AND membership.company_id = :companyId AND membership.status = :status',
          { companyId, status: 'active' },
        )
        .where('assignment.role_id = :roleId', {
          roleId: step.assigned_role_id,
        })
        .select('assignment.company_user_id', 'company_user_id')
        .groupBy('assignment.company_user_id')
        .getRawMany<{ company_user_id: number }>();

      if (assignments.length) {
        return assignments.map((a) => Number(a.company_user_id));
      }
    }

    if (step.assigned_department_id) {
      const memberships = await this.repo(CompanyUser, manager)
        .createQueryBuilder('membership')
        .innerJoin(
          Employee,
          'employee',
          'employee.company_user_id = membership.id',
        )
        .innerJoin(
          EmployeeDepartment,
          'departmentAssignment',
          'departmentAssignment.employee_id = employee.id',
        )
        .innerJoin(
          Department,
          'department',
          'department.id = departmentAssignment.department_id',
        )
        .where('membership.company_id = :companyId', { companyId })
        .andWhere('membership.status = :status', { status: 'active' })
        .andWhere('employee.company_id = :companyId', { companyId })
        .andWhere('employee.employment_status = :employmentStatus', {
          employmentStatus: EmploymentStatusEnum.ACTIVE,
        })
        .andWhere('department.company_id = :companyId', { companyId })
        .andWhere('department.id = :departmentId', {
          departmentId: step.assigned_department_id,
        })
        .andWhere('department.status = :status', { status: 'active' })
        .select('membership.id', 'id')
        .distinct(true)
        .getRawMany<{ id: number }>();
      return memberships.map((membership) => Number(membership.id));
    }

    return [];
  }

  async prepareApprovers(
    companyId: number,
    steps: OnboardingWorkflowStep[],
    manager?: EntityManager,
  ): Promise<WorkflowApproverPlan> {
    if (!steps.length) {
      throw new BadRequestException('Configured workflow has no steps');
    }
    const assignments: WorkflowApproverPlan['assignments'] = [];
    const failures: OnboardingApproverFailure[] = [];
    for (const step of steps) {
      const membershipIds = await this.resolveApproverMembershipIds(
        companyId,
        step,
        manager,
      );
      assignments.push({ step, membershipIds });
      if (step.is_required && !membershipIds.length) {
        failures.push({
          id: step.id,
          step_order: step.step_order,
          name: step.name,
          assigned_user_id: step.assigned_user_id,
          assigned_role_id: step.assigned_role_id,
          assigned_department_id: step.assigned_department_id,
        });
      }
    }
    return { assignments, failures };
  }

  async initializeApprovalsForRequest(
    companyId: number,
    onboardingRequest: OnboardingRequest,
    workflowId?: number | null,
    manager?: EntityManager,
    preparedApprovers?: WorkflowApproverPlan,
  ): Promise<WorkflowInitResult> {
    const workflow = await this.resolveWorkflow(companyId, workflowId, manager);
    const steps =
      preparedApprovers?.assignments.map(({ step }) => step) ??
      (await this.repo(OnboardingWorkflowStep, manager).find({
        where: { workflow_id: workflow.id },
        order: { step_order: 'ASC', id: 'ASC' },
      }));

    const plan =
      preparedApprovers ??
      (await this.prepareApprovers(companyId, steps, manager));
    if (plan.failures.length) {
      throw new BadRequestException({
        message: `Required workflow step at order ${plan.failures[0].step_order} has no eligible approver`,
        warning_details: plan.failures,
      });
    }

    const approvalRepository = this.repo(OnboardingApproval, manager);

    let initialLevel = 0;
    for (const { step, membershipIds } of plan.assignments) {
      if (step.step_type !== OnboardingStepTypeEnum.SIGN_OFF) continue;
      const dueAt = step.due_days
        ? new Date(Date.now() + step.due_days * 86400000)
        : null;
      if (!membershipIds.length) {
        await approvalRepository.save(
          approvalRepository.create({
            onboarding_request_id: onboardingRequest.id,
            workflow_step_id: step.id,
            approval_level: step.step_order,
            approver_company_user_id: null,
            original_approver_company_user_id: null,
            status: OnboardingApprovalStatusEnum.SKIPPED,
            comments:
              'Step skipped automatically due to missing eligible approver',
            acted_at: new Date(),
            due_at: dueAt,
          }),
        );
        continue;
      }

      if (!initialLevel || step.step_order < initialLevel) {
        initialLevel = step.step_order;
      }

      await approvalRepository.save(
        membershipIds.map((membershipId) =>
          approvalRepository.create({
            onboarding_request_id: onboardingRequest.id,
            workflow_step_id: step.id,
            approval_level: step.step_order,
            approver_company_user_id: membershipId,
            original_approver_company_user_id: membershipId,
            status: OnboardingApprovalStatusEnum.PENDING,
            due_at: dueAt,
          }),
        ),
      );
    }

    onboardingRequest.workflow_id = workflow.id;
    onboardingRequest.current_approval_level = initialLevel;
    onboardingRequest.status = initialLevel
      ? OnboardingRequestStatusEnum.IN_REVIEW
      : OnboardingRequestStatusEnum.IN_PROGRESS;
    await this.repo(OnboardingRequest, manager).save(onboardingRequest);

    return { workflow, initialLevel, steps };
  }

  async applyApprovalAction(
    onboardingRequestId: number,
    companyUserId: number,
    payload: {
      approve: boolean;
      comments?: string;
      signature_url?: string;
    },
    manager?: EntityManager,
  ): Promise<OnboardingRequest> {
    const requestRepository = this.repo(OnboardingRequest, manager);
    const approvalRepository = this.repo(OnboardingApproval, manager);

    const onboardingRequest = await requestRepository.findOne({
      where: { id: onboardingRequestId },
    });
    if (!onboardingRequest) {
      throw new NotFoundException('Onboarding request not found');
    }

    if (
      onboardingRequest.status !== OnboardingRequestStatusEnum.SUBMITTED &&
      onboardingRequest.status !== OnboardingRequestStatusEnum.IN_REVIEW &&
      onboardingRequest.status !== OnboardingRequestStatusEnum.IN_PROGRESS
    ) {
      throw new BadRequestException(
        'Only active onboarding requests can be acted on',
      );
    }

    const currentLevel = onboardingRequest.current_approval_level;
    const candidateApprovals = await approvalRepository.find({
      where: {
        onboarding_request_id: onboardingRequest.id,
        approval_level: currentLevel,
        status: OnboardingApprovalStatusEnum.PENDING,
      },
    });

    if (!candidateApprovals.length) {
      throw new BadRequestException('No pending approval at the current level');
    }

    // Company membership IDs are numeric, but some database drivers return
    // integer columns as strings. Compare their numeric values so the
    // assigned approver is not incorrectly rejected solely due to transport
    // representation.
    const actorApproval = candidateApprovals.find(
      (approval) =>
        Number(approval.approver_company_user_id) === Number(companyUserId),
    );
    if (!actorApproval) {
      throw new ForbiddenException(
        'You are not assigned as an approver for the current workflow level',
      );
    }

    actorApproval.status = payload.approve
      ? OnboardingApprovalStatusEnum.APPROVED
      : OnboardingApprovalStatusEnum.REJECTED;
    actorApproval.comments = payload.comments?.trim() || null;
    actorApproval.signature_url = payload.signature_url?.trim() || null;
    actorApproval.acted_at = new Date();
    await approvalRepository.save(actorApproval);

    const otherPending = candidateApprovals.filter(
      (e) => e.id !== actorApproval.id,
    );
    if (otherPending.length) {
      otherPending.forEach((entry) => {
        entry.status = OnboardingApprovalStatusEnum.SKIPPED;
        entry.comments =
          entry.comments ??
          'Skipped because another approver completed this level';
        entry.acted_at = new Date();
      });
      await approvalRepository.save(otherPending);
    }

    if (!payload.approve) {
      onboardingRequest.status = OnboardingRequestStatusEnum.REJECTED;
      onboardingRequest.rejection_reason = payload.comments?.trim() || null;

      const futurePending = await approvalRepository.find({
        where: {
          onboarding_request_id: onboardingRequest.id,
          status: OnboardingApprovalStatusEnum.PENDING,
        },
      });

      if (futurePending.length) {
        futurePending.forEach((entry) => {
          entry.status = OnboardingApprovalStatusEnum.SKIPPED;
          entry.comments =
            entry.comments ?? 'Skipped after onboarding rejection';
          entry.acted_at = new Date();
        });
        await approvalRepository.save(futurePending);
      }

      const saved = await requestRepository.save(onboardingRequest);
      this.emitOnboardingOutcome(saved, companyUserId, manager).catch((e) =>
        this.logger.error('Onboarding rejected emit failed', e),
      );
      return saved;
    }

    const nextPending = await approvalRepository.find({
      where: {
        onboarding_request_id: onboardingRequest.id,
        status: OnboardingApprovalStatusEnum.PENDING,
      },
      order: { approval_level: 'ASC' },
    });

    if (!nextPending.length) {
      onboardingRequest.status = OnboardingRequestStatusEnum.IN_PROGRESS;
      onboardingRequest.current_approval_level = 0;
      onboardingRequest.rejection_reason = null;
      const saved = await requestRepository.save(onboardingRequest);
      this.emitOnboardingOutcome(saved, companyUserId, manager).catch((e) =>
        this.logger.error('Onboarding approved emit failed', e),
      );
      return saved;
    }

    onboardingRequest.status = OnboardingRequestStatusEnum.IN_REVIEW;
    onboardingRequest.current_approval_level = nextPending[0].approval_level;
    onboardingRequest.rejection_reason = null;
    const advanced = await requestRepository.save(onboardingRequest);
    this.emitOnboardingOutcome(advanced, companyUserId, manager).catch((e) =>
      this.logger.error('Onboarding in-review emit failed', e),
    );
    return advanced;
  }

  async listApprovalTrail(
    onboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<OnboardingApproval[]> {
    return this.repo(OnboardingApproval, manager).find({
      where: { onboarding_request_id: onboardingRequestId },
      relations: { approver: { user: true }, workflow_step: true },
      order: { approval_level: 'ASC', id: 'ASC' },
    });
  }

  async closeAllPendingApprovals(
    onboardingRequestId: number,
    comment: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.repo(OnboardingApproval, manager);
    const pending = await repository.find({
      where: {
        onboarding_request_id: onboardingRequestId,
        status: In([OnboardingApprovalStatusEnum.PENDING]),
      },
    });

    if (!pending.length) return;

    pending.forEach((entry) => {
      entry.status = OnboardingApprovalStatusEnum.SKIPPED;
      entry.comments = comment;
      entry.acted_at = new Date();
    });

    await repository.save(pending);
  }

  private async emitOnboardingOutcome(
    onboardingRequest: OnboardingRequest,
    senderCompanyUserId: number | null,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.repo(OnboardingRequest, manager);
    const loaded = await repo.findOne({
      where: { id: onboardingRequest.id },
      relations: { employee: { company_user: { user: true } } },
    });
    if (!loaded?.employee?.company_user?.user?.email) return;

    const employee = loaded.employee;
    const employeeName = `${employee.first_name} ${employee.last_name}`;
    const employeeEmail = employee.company_user!.user.email;
    const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;
    const dashboardUrl = `${frontendUrl}/dashboard/me/onboarding?request_id=${onboardingRequest.id}`;

    if (loaded.status === OnboardingRequestStatusEnum.REJECTED) {
      this.eventEmitter.emit(
        OnboardingRejectedEvent.EVENT,
        new OnboardingRejectedEvent(
          employeeName,
          employeeEmail,
          loaded.rejection_reason ?? null,
          dashboardUrl,
          loaded.id,
          loaded.company_id,
          senderCompanyUserId,
          employee.company_user!.id,
          loaded.onboarding_no,
        ),
      );
      return;
    }

    if (loaded.status === OnboardingRequestStatusEnum.IN_PROGRESS) {
      this.eventEmitter.emit(
        OnboardingApprovedEvent.EVENT,
        new OnboardingApprovedEvent(
          employeeName,
          employeeEmail,
          await this.resolveCompanyRoleRecipients(
            loaded.company_id,
            HR_NOTIFICATION_ROLE_NAMES,
            manager,
          ),
          dashboardUrl,
          loaded.id,
          loaded.company_id,
          senderCompanyUserId,
          employee.company_user!.id,
          loaded.onboarding_no,
        ),
      );
      return;
    }

    if (loaded.status === OnboardingRequestStatusEnum.IN_REVIEW) {
      const approvalRepo = this.repo(OnboardingApproval, manager);
      const nextApprovals = await approvalRepo.find({
        where: {
          onboarding_request_id: loaded.id,
          approval_level: loaded.current_approval_level,
          status: OnboardingApprovalStatusEnum.PENDING,
        },
        relations: { approver: { user: true } },
      });
      const approvers: NotificationRecipient[] = nextApprovals.flatMap(
        (approval) => {
          const recipient = buildNotificationRecipient(
            approval.approver?.user,
            {
              companyUserId: approval.approver?.id,
            },
          );
          return recipient ? [recipient] : [];
        },
      );
      if (approvers.length) {
        this.eventEmitter.emit(
          OnboardingApprovalRequiredEvent.EVENT,
          new OnboardingApprovalRequiredEvent(
            employeeName,
            approvers,
            `${frontendUrl}/dashboard/employees/onboarding?tab=requests&request_id=${onboardingRequest.id}`,
            loaded.id,
            loaded.company_id,
            senderCompanyUserId,
            loaded.onboarding_no,
          ),
        );
      }
    }
  }
}
