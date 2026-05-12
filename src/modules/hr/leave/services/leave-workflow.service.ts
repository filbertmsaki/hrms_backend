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
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveApprovalStatusEnum } from '../enums/leave-approval-status.enum';
import { LeaveApproverTypeEnum } from '../enums/leave-approver-type.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { LeaveApprovalWorkflowStep } from '../entities/leave-approval-workflow-step.entity';
import { LeaveApprovalWorkflow } from '../entities/leave-approval-workflow.entity';
import { LeaveRequestApproval } from '../entities/leave-request-approval.entity';
import { LeaveRequest } from '../entities/leave-request.entity';

type WorkflowInitResult = {
  workflow: LeaveApprovalWorkflow;
  initialLevel: number;
};

@Injectable()
export class LeaveWorkflowService {
  constructor(
    @InjectRepository(LeaveApprovalWorkflow)
    private readonly workflowRepository: Repository<LeaveApprovalWorkflow>,
    @InjectRepository(LeaveApprovalWorkflowStep)
    private readonly workflowStepRepository: Repository<LeaveApprovalWorkflowStep>,
    @InjectRepository(LeaveRequestApproval)
    private readonly leaveRequestApprovalRepository: Repository<LeaveRequestApproval>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(CompanyUserRole)
    private readonly companyUserRoleRepository: Repository<CompanyUserRole>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  private getWorkflowRepository(
    manager?: EntityManager,
  ): Repository<LeaveApprovalWorkflow> {
    return manager?.getRepository(LeaveApprovalWorkflow) ?? this.workflowRepository;
  }

  private getWorkflowStepRepository(
    manager?: EntityManager,
  ): Repository<LeaveApprovalWorkflowStep> {
    return (
      manager?.getRepository(LeaveApprovalWorkflowStep) ?? this.workflowStepRepository
    );
  }

  private getLeaveRequestApprovalRepository(
    manager?: EntityManager,
  ): Repository<LeaveRequestApproval> {
    return (
      manager?.getRepository(LeaveRequestApproval) ??
      this.leaveRequestApprovalRepository
    );
  }

  private getLeaveRequestRepository(
    manager?: EntityManager,
  ): Repository<LeaveRequest> {
    return manager?.getRepository(LeaveRequest) ?? this.leaveRequestRepository;
  }

  private getCompanyUserRepository(
    manager?: EntityManager,
  ): Repository<CompanyUser> {
    return manager?.getRepository(CompanyUser) ?? this.companyUserRepository;
  }

  private getCompanyUserRoleRepository(
    manager?: EntityManager,
  ): Repository<CompanyUserRole> {
    return manager?.getRepository(CompanyUserRole) ?? this.companyUserRoleRepository;
  }

  private getEmployeeRepository(manager?: EntityManager): Repository<Employee> {
    return manager?.getRepository(Employee) ?? this.employeeRepository;
  }

  async resolveWorkflow(
    companyId: number,
    leaveTypeId: number,
    manager?: EntityManager,
  ): Promise<LeaveApprovalWorkflow> {
    const repository = this.getWorkflowRepository(manager);
    const workflow =
      (await repository.findOne({
        where: {
          company_id: companyId,
          leave_type_id: leaveTypeId,
          status: LeaveRecordStatusEnum.ACTIVE,
        },
      })) ??
      (await repository.findOne({
        where: {
          company_id: companyId,
          is_default: true,
          status: LeaveRecordStatusEnum.ACTIVE,
        },
      }));

    if (!workflow) {
      throw new NotFoundException(
        'No active leave approval workflow configured for this company',
      );
    }

    return workflow;
  }

  private async resolveApproverMembershipIds(
    companyId: number,
    step: LeaveApprovalWorkflowStep,
    manager?: EntityManager,
  ): Promise<number[]> {
    if (step.approver_type === LeaveApproverTypeEnum.COMPANY_USER) {
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

    if (step.approver_type === LeaveApproverTypeEnum.ROLE) {
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

    const employees = await this.getEmployeeRepository(manager)
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'membership')
      .where('employee.position_id = :positionId', { positionId: step.position_id })
      .andWhere('membership.company_id = :companyId', { companyId })
      .andWhere('membership.status = :status', { status: 'active' })
      .select('membership.id', 'company_user_id')
      .getRawMany<{ company_user_id: number }>();

    return employees.map((item) => Number(item.company_user_id));
  }

  async initializeWorkflowForRequest(
    companyId: number,
    leaveRequest: LeaveRequest,
    manager?: EntityManager,
  ): Promise<WorkflowInitResult> {
    const workflow = await this.resolveWorkflow(
      companyId,
      leaveRequest.leave_type_id,
      manager,
    );

    const steps = await this.getWorkflowStepRepository(manager).find({
      where: { workflow_id: workflow.id },
      order: { approval_level: 'ASC', id: 'ASC' },
    });

    if (!steps.length) {
      throw new BadRequestException('Configured workflow has no approval steps');
    }

    const leaveRequestApprovalRepository =
      this.getLeaveRequestApprovalRepository(manager);

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
            `Required workflow step at level ${step.approval_level} has no eligible approver`,
          );
        }

        await leaveRequestApprovalRepository.save(
          leaveRequestApprovalRepository.create({
            leave_request_id: leaveRequest.id,
            workflow_step_id: step.id,
            approval_level: step.approval_level,
            approver_company_user_id: null,
            status: LeaveApprovalStatusEnum.SKIPPED,
            comments: 'Step skipped automatically due to missing eligible approver',
            acted_at: new Date(),
          }),
        );
        continue;
      }

      if (!initialLevel || step.approval_level < initialLevel) {
        initialLevel = step.approval_level;
      }

      await leaveRequestApprovalRepository.save(
        membershipIds.map((membershipId) =>
          leaveRequestApprovalRepository.create({
            leave_request_id: leaveRequest.id,
            workflow_step_id: step.id,
            approval_level: step.approval_level,
            approver_company_user_id: membershipId,
            status: LeaveApprovalStatusEnum.PENDING,
          }),
        ),
      );
    }

    if (!initialLevel) {
      throw new BadRequestException(
        'Workflow initialization produced no pending approvals',
      );
    }

    leaveRequest.current_approval_level = initialLevel;
    leaveRequest.status = LeaveStatusEnum.IN_REVIEW;
    await this.getLeaveRequestRepository(manager).save(leaveRequest);

    return {
      workflow,
      initialLevel,
    };
  }

  async applyApprovalAction(
    leaveRequestId: number,
    companyUserId: number,
    payload: {
      approve: boolean;
      comments?: string;
      signature_url?: string;
    },
    manager?: EntityManager,
  ): Promise<LeaveRequest> {
    const leaveRequestRepository = this.getLeaveRequestRepository(manager);
    const leaveRequestApprovalRepository =
      this.getLeaveRequestApprovalRepository(manager);

    const leaveRequest = await leaveRequestRepository.findOne({
      where: { id: leaveRequestId },
    });

    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    if (
      leaveRequest.status !== LeaveStatusEnum.IN_REVIEW &&
      leaveRequest.status !== LeaveStatusEnum.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only submitted or in-review leave requests can be acted on',
      );
    }

    const currentLevel = leaveRequest.current_approval_level;
    const candidateApprovals = await leaveRequestApprovalRepository.find({
      where: {
        leave_request_id: leaveRequest.id,
        approval_level: currentLevel,
        status: LeaveApprovalStatusEnum.PENDING,
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
      ? LeaveApprovalStatusEnum.APPROVED
      : LeaveApprovalStatusEnum.REJECTED;
    actorApproval.comments = payload.comments?.trim() || null;
    actorApproval.signature_url = payload.signature_url?.trim() || null;
    actorApproval.acted_at = new Date();
    await leaveRequestApprovalRepository.save(actorApproval);

    const otherPending = candidateApprovals.filter(
      (item) => item.id !== actorApproval.id,
    );
    if (otherPending.length) {
      otherPending.forEach((item) => {
        item.status = LeaveApprovalStatusEnum.SKIPPED;
        item.comments =
          item.comments ?? 'Skipped because another approver completed this level';
        item.acted_at = new Date();
      });
      await leaveRequestApprovalRepository.save(otherPending);
    }

    if (!payload.approve) {
      leaveRequest.status = LeaveStatusEnum.REJECTED;
      leaveRequest.rejection_reason = payload.comments?.trim() || null;

      const futurePending = await leaveRequestApprovalRepository.find({
        where: {
          leave_request_id: leaveRequest.id,
          status: LeaveApprovalStatusEnum.PENDING,
        },
      });

      if (futurePending.length) {
        futurePending.forEach((item) => {
          item.status = LeaveApprovalStatusEnum.SKIPPED;
          item.comments = item.comments ?? 'Skipped after leave rejection';
          item.acted_at = new Date();
        });
        await leaveRequestApprovalRepository.save(futurePending);
      }

      return leaveRequestRepository.save(leaveRequest);
    }

    const nextPending = await leaveRequestApprovalRepository.find({
      where: {
        leave_request_id: leaveRequest.id,
        status: LeaveApprovalStatusEnum.PENDING,
      },
      order: { approval_level: 'ASC' },
    });

    if (!nextPending.length) {
      leaveRequest.status = LeaveStatusEnum.APPROVED;
      leaveRequest.approved_at = new Date();
      return leaveRequestRepository.save(leaveRequest);
    }

    leaveRequest.status = LeaveStatusEnum.IN_REVIEW;
    leaveRequest.current_approval_level = nextPending[0].approval_level;
    leaveRequest.approved_at = null;
    return leaveRequestRepository.save(leaveRequest);
  }

  async listApprovalTrail(
    leaveRequestId: number,
    manager?: EntityManager,
  ): Promise<LeaveRequestApproval[]> {
    return this.getLeaveRequestApprovalRepository(manager).find({
      where: { leave_request_id: leaveRequestId },
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
    leaveRequestId: number,
    comment: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getLeaveRequestApprovalRepository(manager);
    const pending = await repository.find({
      where: {
        leave_request_id: leaveRequestId,
        status: In([LeaveApprovalStatusEnum.PENDING]),
      },
    });

    if (!pending.length) {
      return;
    }

    pending.forEach((entry) => {
      entry.status = LeaveApprovalStatusEnum.SKIPPED;
      entry.comments = comment;
      entry.acted_at = new Date();
    });

    await repository.save(pending);
  }
}
