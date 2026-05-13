import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../../companies/entities/company-user-role.entity';
import { EmployeePositionStatusEnum } from '../../employees/enums/employee-position-status.enum';
import { EmployeePosition } from '../../employees/entities/employee-position.entity';
import { OnboardingApprovalStatusEnum } from '../enums/onboarding-approval-status.enum';
import { OnboardingApproverTypeEnum } from '../enums/onboarding-approver-type.enum';
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
    @InjectRepository(EmployeePosition)
    private readonly employeePositionRepository: Repository<EmployeePosition>,
  ) {}

  private getWorkflowRepository(manager?: EntityManager): Repository<OnboardingWorkflow> {
    return manager?.getRepository(OnboardingWorkflow) ?? this.workflowRepository;
  }

  private getWorkflowStepRepository(
    manager?: EntityManager,
  ): Repository<OnboardingWorkflowStep> {
    return manager?.getRepository(OnboardingWorkflowStep) ?? this.workflowStepRepository;
  }

  private getOnboardingApprovalRepository(
    manager?: EntityManager,
  ): Repository<OnboardingApproval> {
    return manager?.getRepository(OnboardingApproval) ?? this.onboardingApprovalRepository;
  }

  private getOnboardingRequestRepository(
    manager?: EntityManager,
  ): Repository<OnboardingRequest> {
    return manager?.getRepository(OnboardingRequest) ?? this.onboardingRequestRepository;
  }

  private getCompanyUserRepository(manager?: EntityManager): Repository<CompanyUser> {
    return manager?.getRepository(CompanyUser) ?? this.companyUserRepository;
  }

  private getCompanyUserRoleRepository(
    manager?: EntityManager,
  ): Repository<CompanyUserRole> {
    return manager?.getRepository(CompanyUserRole) ?? this.companyUserRoleRepository;
  }

  private getEmployeePositionRepository(
    manager?: EntityManager,
  ): Repository<EmployeePosition> {
    return (
      manager?.getRepository(EmployeePosition) ?? this.employeePositionRepository
    );
  }

  async resolveWorkflow(
    companyId: number,
    workflowId?: number | null,
    manager?: EntityManager,
  ): Promise<OnboardingWorkflow> {
    const repository = this.getWorkflowRepository(manager);

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
    if (step.approver_type === OnboardingApproverTypeEnum.COMPANY_USER) {
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

    if (step.approver_type === OnboardingApproverTypeEnum.ROLE) {
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

      return assignments.map((assignment) => Number(assignment.company_user_id));
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
      .andWhere('(employeePosition.end_date IS NULL OR employeePosition.end_date >= CURDATE())')
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
        {
          departmentId: step.assigned_department_id,
        },
      );
    }

    const employees = await assignments.getRawMany<{ company_user_id: number }>();

    return employees.map((entry) => Number(entry.company_user_id));
  }

  async initializeApprovalsForRequest(
    companyId: number,
    onboardingRequest: OnboardingRequest,
    workflowId?: number | null,
    manager?: EntityManager,
  ): Promise<WorkflowInitResult> {
    const workflow = await this.resolveWorkflow(companyId, workflowId, manager);
    const steps = await this.getWorkflowStepRepository(manager).find({
      where: { workflow_id: workflow.id },
      order: { approval_level: 'ASC', id: 'ASC' },
    });

    if (!steps.length) {
      throw new BadRequestException('Configured workflow has no approval steps');
    }

    const approvalRepository = this.getOnboardingApprovalRepository(manager);

    let initialLevel = 0;
    for (const step of steps) {
      const membershipIds = await this.resolveApproverMembershipIds(companyId, step, manager);

      if (!membershipIds.length) {
        if (step.is_required) {
          throw new BadRequestException(
            `Required workflow step at level ${step.approval_level} has no eligible approver`,
          );
        }

        await approvalRepository.save(
          approvalRepository.create({
            onboarding_request_id: onboardingRequest.id,
            workflow_step_id: step.id,
            approval_level: step.approval_level,
            approver_company_user_id: null,
            status: OnboardingApprovalStatusEnum.SKIPPED,
            comments: 'Step skipped automatically due to missing eligible approver',
            acted_at: new Date(),
          }),
        );
        continue;
      }

      if (!initialLevel || step.approval_level < initialLevel) {
        initialLevel = step.approval_level;
      }

      await approvalRepository.save(
        membershipIds.map((membershipId) =>
          approvalRepository.create({
            onboarding_request_id: onboardingRequest.id,
            workflow_step_id: step.id,
            approval_level: step.approval_level,
            approver_company_user_id: membershipId,
            status: OnboardingApprovalStatusEnum.PENDING,
          }),
        ),
      );
    }

    if (!initialLevel) {
      throw new BadRequestException('Workflow initialization produced no pending approvals');
    }

    onboardingRequest.workflow_id = workflow.id;
    onboardingRequest.current_approval_level = initialLevel;
    onboardingRequest.status = OnboardingRequestStatusEnum.IN_REVIEW;
    await this.getOnboardingRequestRepository(manager).save(onboardingRequest);

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
    const requestRepository = this.getOnboardingRequestRepository(manager);
    const approvalRepository = this.getOnboardingApprovalRepository(manager);

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
      throw new BadRequestException('Only active onboarding requests can be acted on');
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

    const otherPending = candidateApprovals.filter((entry) => entry.id !== actorApproval.id);
    if (otherPending.length) {
      otherPending.forEach((entry) => {
        entry.status = OnboardingApprovalStatusEnum.SKIPPED;
        entry.comments = entry.comments ?? 'Skipped because another approver completed this level';
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
          entry.comments = entry.comments ?? 'Skipped after onboarding rejection';
          entry.acted_at = new Date();
        });
        await approvalRepository.save(futurePending);
      }

      return requestRepository.save(onboardingRequest);
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
      return requestRepository.save(onboardingRequest);
    }

    onboardingRequest.status = OnboardingRequestStatusEnum.IN_REVIEW;
    onboardingRequest.current_approval_level = nextPending[0].approval_level;
    onboardingRequest.rejection_reason = null;
    return requestRepository.save(onboardingRequest);
  }

  async listApprovalTrail(
    onboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<OnboardingApproval[]> {
    return this.getOnboardingApprovalRepository(manager).find({
      where: { onboarding_request_id: onboardingRequestId },
      relations: {
        approver: {
          user: true,
        },
        workflow_step: true,
      },
      order: { approval_level: 'ASC', id: 'ASC' },
    });
  }

  async closeAllPendingApprovals(
    onboardingRequestId: number,
    comment: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getOnboardingApprovalRepository(manager);
    const pending = await repository.find({
      where: {
        onboarding_request_id: onboardingRequestId,
        status: In([OnboardingApprovalStatusEnum.PENDING]),
      },
    });

    if (!pending.length) {
      return;
    }

    pending.forEach((entry) => {
      entry.status = OnboardingApprovalStatusEnum.SKIPPED;
      entry.comments = comment;
      entry.acted_at = new Date();
    });

    await repository.save(pending);
  }
}
