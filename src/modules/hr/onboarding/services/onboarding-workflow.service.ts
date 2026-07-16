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
import { OnboardingApprovalStatusEnum } from '../enums/onboarding-approval-status.enum';
import { OnboardingRecordStatusEnum } from '../enums/onboarding-record-status.enum';
import { OnboardingRequestStatusEnum } from '../enums/onboarding-request-status.enum';
import { OnboardingApproval } from '../entities/onboarding-approval.entity';
import { OnboardingRequest } from '../entities/onboarding-request.entity';
import { OnboardingWorkflowStep } from '../entities/onboarding-workflow-step.entity';
import { OnboardingWorkflow } from '../entities/onboarding-workflow.entity';

type WorkflowInitResult = {
  workflow: OnboardingWorkflow;
  initialLevel: number;
  steps: OnboardingWorkflowStep[];
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
      return membership ? [membership.id] : [];
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

      return assignments.map((a) => Number(a.company_user_id));
    }

    return [];
  }

  async initializeApprovalsForRequest(
    companyId: number,
    onboardingRequest: OnboardingRequest,
    workflowId?: number | null,
    manager?: EntityManager,
  ): Promise<WorkflowInitResult> {
    const workflow = await this.resolveWorkflow(companyId, workflowId, manager);
    const steps = await this.repo(OnboardingWorkflowStep, manager).find({
      where: { workflow_id: workflow.id },
      order: { step_order: 'ASC', id: 'ASC' },
    });

    if (!steps.length) {
      throw new BadRequestException('Configured workflow has no steps');
    }

    const approvalRepository = this.repo(OnboardingApproval, manager);

    let initialLevel = 0;
    for (const step of steps) {
      const membershipIds = await this.resolveApproverMembershipIds(
        companyId,
        step,
        manager,
      );

      if (!membershipIds.length) {
        if (step.is_required) {
          throw new BadRequestException(
            `Required workflow step at order ${step.step_order} has no eligible approver`,
          );
        }

        await approvalRepository.save(
          approvalRepository.create({
            onboarding_request_id: onboardingRequest.id,
            workflow_step_id: step.id,
            approval_level: step.step_order,
            approver_company_user_id: null,
            status: OnboardingApprovalStatusEnum.SKIPPED,
            comments:
              'Step skipped automatically due to missing eligible approver',
            acted_at: new Date(),
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
            status: OnboardingApprovalStatusEnum.PENDING,
          }),
        ),
      );
    }

    if (!initialLevel) {
      throw new BadRequestException(
        'Workflow initialization produced no pending approvals',
      );
    }

    onboardingRequest.workflow_id = workflow.id;
    onboardingRequest.current_approval_level = initialLevel;
    onboardingRequest.status = OnboardingRequestStatusEnum.IN_REVIEW;
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

    const actorApproval = candidateApprovals.find(
      (approval) => approval.approver_company_user_id === companyUserId,
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
    const employeeEmail = employee.company_user.user.email;
    const frontendUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      'http://localhost:5173';
    const dashboardUrl = `${frontendUrl}/onboarding/${onboardingRequest.id}`;

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
          employee.company_user.id,
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
          employee.company_user.id,
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
            `${frontendUrl}/onboarding/${onboardingRequest.id}/review`,
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
