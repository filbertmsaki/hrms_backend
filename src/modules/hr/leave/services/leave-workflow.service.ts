import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  LeaveApprovalRequiredEvent,
  LeaveForwardedEvent,
  LeaveApprovedEvent,
  LeaveRejectedEvent,
  LeaveReturnedForCorrectionEvent,
} from '../../../hr/notifications/events';
import { buildNotificationRecipient } from '../../notifications/notification-recipient.util';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../../companies/entities/company-user-role.entity';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeePositionStatusEnum } from '../../employees/enums/employee-position-status.enum';
import { EmployeePosition } from '../../employees/entities/employee-position.entity';
import { LeaveApprovalActionEnum } from '../enums/leave-approval-action.enum';
import { LeaveApprovalStatusEnum } from '../enums/leave-approval-status.enum';
import { LeaveApproverTypeEnum } from '../enums/leave-approver-type.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { LeaveApprovalWorkflowStep } from '../entities/leave-approval-workflow-step.entity';
import { LeaveApprovalWorkflow } from '../entities/leave-approval-workflow.entity';
import { LeaveRequestApproval } from '../entities/leave-request-approval.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveManagementApprovalRule } from '../entities/leave-management-approval-rule.entity';
import { LeaveApprovalDelegation } from '../entities/leave-approval-delegation.entity';
import { DelegationResult, resolveDelegates } from './leave-delegation.service';

const DEPARTMENT_MANAGER_LEVEL = 1;
const HR_LEVEL = 2;
/** Optional, rule-driven final approval after HR (status IN_REVIEW). */
const MANAGEMENT_LEVEL = 3;

type DepartmentManagerResolution = {
  companyUserId: number | null;
  auditNote: string | null;
};

@Injectable()
export class LeaveWorkflowService {
  private readonly logger = new Logger(LeaveWorkflowService.name);
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
    @InjectRepository(EmployeePosition)
    private readonly employeePositionRepository: Repository<EmployeePosition>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  private getWorkflowRepository(
    manager?: EntityManager,
  ): Repository<LeaveApprovalWorkflow> {
    return (
      manager?.getRepository(LeaveApprovalWorkflow) ?? this.workflowRepository
    );
  }

  private getWorkflowStepRepository(
    manager?: EntityManager,
  ): Repository<LeaveApprovalWorkflowStep> {
    return (
      manager?.getRepository(LeaveApprovalWorkflowStep) ??
      this.workflowStepRepository
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

  private getDepartmentRepository(
    manager?: EntityManager,
  ): Repository<Department> {
    return manager?.getRepository(Department) ?? this.departmentRepository;
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

      return assignments.map((assignment) =>
        Number(assignment.company_user_id),
      );
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
        '(employeePosition.end_date IS NULL OR employeePosition.end_date >= CURRENT_DATE)',
      )
      .andWhere('membership.company_id = :companyId', { companyId })
      .andWhere('membership.status = :status', { status: 'active' })
      .select('membership.id', 'company_user_id')
      .groupBy('membership.id');

    if (step.assigned_branch_id) {
      assignments.andWhere(
        `(
          position.branch_id = :branchId
          OR employee.primary_branch_id = :branchId
          OR EXISTS (
            SELECT 1
            FROM department_positions department_position
            INNER JOIN departments mapped_department
              ON mapped_department.id = department_position.department_id
            WHERE department_position.company_id = :companyId
              AND department_position.position_id = position.id
              AND mapped_department.branch_id = :branchId
          )
        )`,
        {
          branchId: step.assigned_branch_id,
        },
      );
    }

    if (step.assigned_department_id) {
      assignments.andWhere(
        `(
          position.department_id = :departmentId
          OR employee.primary_department_id = :departmentId
          OR EXISTS (
            SELECT 1
            FROM department_positions department_position
            WHERE department_position.company_id = :companyId
              AND department_position.position_id = position.id
              AND department_position.department_id = :departmentId
          )
        )`,
        {
          departmentId: step.assigned_department_id,
        },
      );
    }

    const employees = await assignments.getRawMany<{
      company_user_id: number;
    }>();

    return employees.map((item) => Number(item.company_user_id));
  }

  /**
   * Resolves the department-manager approver for the requesting employee's
   * primary department. If the requester IS the configured manager, escalates
   * to their own reports_to (single hop); if that is also absent, the step is
   * skipped with an audit note rather than allowing self-approval.
   */
  private async resolveDepartmentManagerApproverId(
    companyId: number,
    employee: Employee,
    manager?: EntityManager,
  ): Promise<DepartmentManagerResolution> {
    if (!employee.primary_department_id) {
      return {
        companyUserId: null,
        auditNote:
          'Employee has no primary department configured; awaiting routing correction',
      };
    }

    const department = await this.getDepartmentRepository(manager).findOne({
      where: { id: employee.primary_department_id, company_id: companyId },
    });

    if (!department?.manager_employee_id) {
      return {
        companyUserId: null,
        auditNote:
          'Department has no configured manager; awaiting routing correction',
      };
    }

    if (department.manager_employee_id === employee.id) {
      if (!employee.reports_to) {
        return {
          companyUserId: null,
          auditNote:
            'Requester is the department manager with no reports_to configured; awaiting routing correction',
        };
      }

      const escalatedManager = await this.getEmployeeRepository(
        manager,
      ).findOne({
        where: { id: employee.reports_to, company_id: companyId },
        select: ['id', 'company_user_id'],
      });

      return {
        companyUserId: escalatedManager?.company_user_id ?? null,
        auditNote: escalatedManager
          ? 'Requester is the department manager; escalated to their own reports_to'
          : 'Requester is the department manager and reports_to could not be resolved; awaiting routing correction',
      };
    }

    const managerEmployee = await this.getEmployeeRepository(manager).findOne({
      where: { id: department.manager_employee_id, company_id: companyId },
      select: ['id', 'company_user_id'],
    });

    return {
      companyUserId: managerEmployee?.company_user_id ?? null,
      auditNote: managerEmployee
        ? null
        : 'Configured department manager employee record could not be resolved; awaiting routing correction',
    };
  }

  async resolveHrApproverMembershipIds(
    companyId: number,
    leaveTypeId: number,
    manager?: EntityManager,
  ): Promise<number[]> {
    const workflow = await this.resolveWorkflow(
      companyId,
      leaveTypeId,
      manager,
    );
    const steps = await this.getWorkflowStepRepository(manager).find({
      where: { workflow_id: workflow.id },
      order: { approval_level: 'ASC', id: 'ASC' },
    });

    if (steps.length !== 2) {
      throw new BadRequestException(
        `Leave approval workflow "${workflow.name}" must have exactly 2 steps (department manager, HR); found ${steps.length}. Fix the workflow configuration.`,
      );
    }

    const hrStep = steps.find((step) => step.approval_level === HR_LEVEL);
    if (!hrStep) {
      throw new BadRequestException(
        `Leave approval workflow "${workflow.name}" is missing the HR step (level ${HR_LEVEL}).`,
      );
    }

    return this.resolveApproverMembershipIds(companyId, hrStep, manager);
  }

  async initializeWorkflowForRequest(
    companyId: number,
    leaveRequest: LeaveRequest,
    employee: Employee,
    manager?: EntityManager,
  ): Promise<void> {
    const leaveRequestApprovalRepository =
      this.getLeaveRequestApprovalRepository(manager);
    const cycle = leaveRequest.approval_cycle;

    const deptManagerResolution = await this.resolveDepartmentManagerApproverId(
      companyId,
      employee,
      manager,
    );
    // No department manager: fall back to the reporting manager (reports_to).
    if (
      !deptManagerResolution.companyUserId &&
      employee.reports_to &&
      employee.reports_to !== employee.id
    ) {
      const reportingManager = await this.getEmployeeRepository(
        manager,
      ).findOne({
        where: { id: employee.reports_to, company_id: companyId },
        select: ['id', 'company_user_id'],
      });
      if (reportingManager?.company_user_id) {
        deptManagerResolution.companyUserId = reportingManager.company_user_id;
        deptManagerResolution.auditNote =
          'No department manager; routed to the employee reporting manager';
      }
    }

    let initialLevel: number;

    if (deptManagerResolution.companyUserId === employee.company_user_id) {
      deptManagerResolution.companyUserId = null;
    }
    if (deptManagerResolution.companyUserId) {
      const membership = await this.getCompanyUserRepository(manager).findOne({
        where: {
          id: deptManagerResolution.companyUserId,
          company_id: companyId,
          status: 'active',
        },
        select: ['id'],
      });
      if (!membership) deptManagerResolution.companyUserId = null;
    }
    if (deptManagerResolution.companyUserId) {
      const [assigned] = await this.applyDelegations(
        companyId,
        [deptManagerResolution.companyUserId],
        employee.company_user_id,
        manager,
      );
      await leaveRequestApprovalRepository.save(
        leaveRequestApprovalRepository.create({
          leave_request_id: leaveRequest.id,
          workflow_step_id: null,
          approval_level: DEPARTMENT_MANAGER_LEVEL,
          approval_cycle: cycle,
          approver_company_user_id: assigned.companyUserId,
          status: LeaveApprovalStatusEnum.PENDING,
          comments: this.joinNotes(
            deptManagerResolution.auditNote,
            this.delegationNote(assigned),
          ),
        }),
      );
      initialLevel = DEPARTMENT_MANAGER_LEVEL;
    } else {
      // No reporting manager at all: HR reviews directly (no manual routing).
      initialLevel = HR_LEVEL;
    }
    leaveRequest.routing_required = false;

    // The applicant never approves their own request at any level.
    const hrMembershipIds = (
      await this.resolveHrApproverMembershipIds(
        companyId,
        leaveRequest.leave_type_id,
        manager,
      )
    ).filter((id) => id !== employee.company_user_id);

    if (!hrMembershipIds.length) {
      throw new BadRequestException(
        'No eligible HR approver is configured for this leave workflow',
      );
    }

    const hrAssignments = await this.applyDelegations(
      companyId,
      hrMembershipIds,
      employee.company_user_id,
      manager,
    );
    await leaveRequestApprovalRepository.save(
      hrAssignments.map((assigned) =>
        leaveRequestApprovalRepository.create({
          leave_request_id: leaveRequest.id,
          workflow_step_id: null,
          approval_level: HR_LEVEL,
          approval_cycle: cycle,
          approver_company_user_id: assigned.companyUserId,
          status: LeaveApprovalStatusEnum.PENDING,
          comments: this.joinNotes(
            initialLevel === HR_LEVEL
              ? `${(
                  deptManagerResolution.auditNote ?? 'No reporting manager'
                ).replace(
                  /; awaiting routing correction$/,
                  '',
                )}; routed directly to HR`
              : null,
            this.delegationNote(assigned),
          ),
        }),
      ),
    );

    const managementRules = await this.findMatchingManagementRules(
      companyId,
      leaveRequest,
      employee,
      manager,
    );
    if (managementRules.length) {
      const managementIds = new Set<number>();
      for (const rule of managementRules) {
        for (const id of await this.resolveApproverMembershipIds(
          companyId,
          rule as unknown as LeaveApprovalWorkflowStep,
          manager,
        )) {
          if (id !== employee.company_user_id) managementIds.add(id);
        }
      }
      if (!managementIds.size) {
        throw new BadRequestException(
          `Management approval is required (${managementRules
            .map((rule) => rule.name)
            .join(', ')}) but no eligible management approver is configured.`,
        );
      }
      const managementAssignments = await this.applyDelegations(
        companyId,
        [...managementIds],
        employee.company_user_id,
        manager,
      );
      await leaveRequestApprovalRepository.save(
        managementAssignments.map((assigned) =>
          leaveRequestApprovalRepository.create({
            leave_request_id: leaveRequest.id,
            workflow_step_id: null,
            approval_level: MANAGEMENT_LEVEL,
            approval_cycle: cycle,
            approver_company_user_id: assigned.companyUserId,
            status: LeaveApprovalStatusEnum.PENDING,
            comments: this.delegationNote(assigned),
          }),
        ),
      );
    }

    leaveRequest.workflow_snapshot = {
      approval_sequence: [
        ...(initialLevel === DEPARTMENT_MANAGER_LEVEL
          ? [DEPARTMENT_MANAGER_LEVEL]
          : []),
        HR_LEVEL,
        ...(managementRules.length ? [MANAGEMENT_LEVEL] : []),
      ],
      manager_routing_note:
        initialLevel === HR_LEVEL
          ? `${(
              deptManagerResolution.auditNote ?? 'No reporting manager'
            ).replace(
              /; awaiting routing correction$/,
              '',
            )}; routed directly to HR`
          : (deptManagerResolution.auditNote ?? null),
      management_rule_ids: managementRules.map((rule) => rule.id),
    };
    leaveRequest.current_approval_level = initialLevel;
    leaveRequest.status = this.statusForLevel(initialLevel);
    this.markStageEntered(leaveRequest);
    await this.getLeaveRequestRepository(manager).save(leaveRequest);
  }

  /** Swaps approvers with an active out-of-office delegation today. */
  async applyDelegations(
    companyId: number,
    approverIds: number[],
    applicantCompanyUserId: number | null,
    manager?: EntityManager,
  ): Promise<DelegationResult[]> {
    if (!approverIds.length) return [];
    const today = new Date().toISOString().slice(0, 10);
    const delegations = await this.getEmployeeRepository(manager)
      .manager.getRepository(LeaveApprovalDelegation)
      .find({
        where: {
          company_id: companyId,
          status: 'active',
          delegator_company_user_id: In(approverIds),
          start_date: LessThanOrEqual(today),
          end_date: MoreThanOrEqual(today),
        },
        order: { id: 'DESC' },
      });
    return resolveDelegates(delegations, approverIds, applicantCompanyUserId);
  }

  private delegationNote(assigned: DelegationResult): string | null {
    return assigned.onBehalfOf
      ? `Delegated approver acting for company user #${assigned.onBehalfOf}`
      : null;
  }

  private joinNotes(...notes: Array<string | null | undefined>) {
    const text = notes.filter(Boolean).join('; ');
    return text || null;
  }

  /** Restarts reminder/escalation timing for a new approval stage. */
  private markStageEntered(leaveRequest: LeaveRequest) {
    leaveRequest.stage_entered_at = new Date();
    leaveRequest.stage_reminded_at = null;
    leaveRequest.stage_escalated_at = null;
  }

  private statusForLevel(level: number): LeaveStatusEnum {
    if (level === DEPARTMENT_MANAGER_LEVEL) {
      return LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER;
    }
    if (level === MANAGEMENT_LEVEL) return LeaveStatusEnum.IN_REVIEW;
    return LeaveStatusEnum.PENDING_HR;
  }

  /** Active management rules whose every configured condition matches. */
  async findMatchingManagementRules(
    companyId: number,
    leaveRequest: LeaveRequest,
    employee: Employee,
    manager?: EntityManager,
  ): Promise<LeaveManagementApprovalRule[]> {
    const rules = await this.getEmployeeRepository(manager)
      .manager.getRepository(LeaveManagementApprovalRule)
      .find({
        where: { company_id: companyId, status: LeaveRecordStatusEnum.ACTIVE },
        order: { id: 'ASC' },
      });
    const totalDays = Number(leaveRequest.total_days ?? 0);
    const listMatches = (list: number[] | null, value: number | null) =>
      !list?.length || (value !== null && list.includes(value));
    return rules.filter(
      (rule) =>
        listMatches(rule.leave_type_ids, leaveRequest.leave_type_id) &&
        listMatches(rule.position_ids, employee.primary_position_id ?? null) &&
        listMatches(rule.grade_ids, employee.grade_id ?? null) &&
        listMatches(
          rule.department_ids,
          employee.primary_department_id ?? null,
        ) &&
        (rule.min_total_days === null ||
          totalDays >= Number(rule.min_total_days)),
    );
  }

  async applyApprovalAction(
    leaveRequestId: number,
    companyUserId: number,
    payload: {
      action: LeaveApprovalActionEnum;
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
      relations: { employee: true },
    });

    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    if (
      leaveRequest.status !== LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER &&
      leaveRequest.status !== LeaveStatusEnum.PENDING_HR &&
      leaveRequest.status !== LeaveStatusEnum.IN_REVIEW
    ) {
      throw new BadRequestException(
        'Only requests pending manager, HR or management review can be acted on',
      );
    }

    if (
      payload.action === LeaveApprovalActionEnum.REJECT &&
      !payload.comments?.trim()
    ) {
      throw new BadRequestException('A rejection reason is required.');
    }

    if (leaveRequest.employee.company_user_id === companyUserId) {
      throw new ForbiddenException('You cannot approve your own leave request');
    }

    if (leaveRequest.routing_required)
      throw new BadRequestException(
        'This request is awaiting manager routing correction',
      );
    const currentLevel = leaveRequest.current_approval_level;
    const cycle = leaveRequest.approval_cycle;
    const candidateApprovals = await leaveRequestApprovalRepository.find({
      where: {
        leave_request_id: leaveRequest.id,
        approval_level: currentLevel,
        approval_cycle: cycle,
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

    const otherPending = candidateApprovals.filter(
      (item) => item.id !== actorApproval.id,
    );

    if (payload.action === LeaveApprovalActionEnum.RETURN_FOR_CORRECTION) {
      actorApproval.status = LeaveApprovalStatusEnum.RETURNED;
      actorApproval.action = LeaveApprovalActionEnum.RETURN_FOR_CORRECTION;
      actorApproval.comments = payload.comments?.trim() || null;
      actorApproval.signature_url = payload.signature_url?.trim() || null;
      actorApproval.acted_at = new Date();
      await leaveRequestApprovalRepository.save(actorApproval);

      if (otherPending.length) {
        otherPending.forEach((item) => {
          item.status = LeaveApprovalStatusEnum.SKIPPED;
          item.comments =
            item.comments ??
            'Skipped because the request was returned for correction';
          item.acted_at = new Date();
        });
        await leaveRequestApprovalRepository.save(otherPending);
      }

      leaveRequest.status = LeaveStatusEnum.RETURNED_FOR_CORRECTION;
      leaveRequest.returned_at = new Date();
      leaveRequest.return_reason = payload.comments?.trim() || null;
      const saved = await leaveRequestRepository.save(leaveRequest);
      if (!manager)
        await this.emitLeaveOutcome(
          saved,
          null,
          leaveRequestApprovalRepository,
          companyUserId,
          manager,
        );
      return saved;
    }

    actorApproval.status =
      payload.action === LeaveApprovalActionEnum.APPROVE
        ? LeaveApprovalStatusEnum.APPROVED
        : LeaveApprovalStatusEnum.REJECTED;
    actorApproval.action = payload.action;
    actorApproval.comments = payload.comments?.trim() || null;
    actorApproval.signature_url = payload.signature_url?.trim() || null;
    actorApproval.acted_at = new Date();
    await leaveRequestApprovalRepository.save(actorApproval);

    if (otherPending.length) {
      otherPending.forEach((item) => {
        item.status = LeaveApprovalStatusEnum.SKIPPED;
        item.comments =
          item.comments ??
          'Skipped because another approver completed this level';
        item.acted_at = new Date();
      });
      await leaveRequestApprovalRepository.save(otherPending);
    }

    if (payload.action === LeaveApprovalActionEnum.REJECT) {
      leaveRequest.status = LeaveStatusEnum.REJECTED;
      leaveRequest.rejection_reason = payload.comments?.trim() || null;

      const futurePending = await leaveRequestApprovalRepository.find({
        where: {
          leave_request_id: leaveRequest.id,
          approval_cycle: cycle,
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

      const saved = await leaveRequestRepository.save(leaveRequest);
      if (!manager)
        await this.emitLeaveOutcome(
          saved,
          payload.comments ?? null,
          leaveRequestApprovalRepository,
          companyUserId,
          manager,
        );
      return saved;
    }

    // approve branch: advance through the sequence recorded at submission.
    // Requests routed before sequences existed are manager -> HR.
    const recordedSequence = (
      leaveRequest.workflow_snapshot as { approval_sequence?: unknown } | null
    )?.approval_sequence;
    const sequence =
      Array.isArray(recordedSequence) && recordedSequence.length
        ? recordedSequence.map(Number)
        : [DEPARTMENT_MANAGER_LEVEL, HR_LEVEL];
    const nextLevel = sequence[sequence.indexOf(currentLevel) + 1];
    if (nextLevel !== undefined && sequence.includes(currentLevel)) {
      leaveRequest.status = this.statusForLevel(nextLevel);
      leaveRequest.current_approval_level = nextLevel;
      this.markStageEntered(leaveRequest);
      const saved = await leaveRequestRepository.save(leaveRequest);
      if (!manager)
        await this.emitLeaveOutcome(
          saved,
          null,
          leaveRequestApprovalRepository,
          companyUserId,
          manager,
        );
      return saved;
    }

    leaveRequest.status = LeaveStatusEnum.APPROVED;
    leaveRequest.approved_at = new Date();
    const saved = await leaveRequestRepository.save(leaveRequest);
    if (!manager)
      await this.emitLeaveOutcome(
        saved,
        null,
        leaveRequestApprovalRepository,
        companyUserId,
        manager,
      );
    return saved;
  }

  async notifyCommittedOutcome(
    request: LeaveRequest,
    comments: string | null,
    actorCompanyUserId: number,
  ): Promise<void> {
    try {
      await this.emitLeaveOutcome(
        request,
        comments,
        this.leaveRequestApprovalRepository,
        actorCompanyUserId,
      );
    } catch (error) {
      // The approval is already committed. Notification failure must not prevent
      // the audit entry or attendance recalculation from being queued.
      this.logger.error(
        `Could not notify leave outcome for request ${request.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async emitLeaveOutcome(
    leaveRequest: LeaveRequest,
    rejectionComments: string | null,
    approvalRepo: Repository<LeaveRequestApproval>,
    actorCompanyUserId: number | null,
    manager?: EntityManager,
  ): Promise<void> {
    const requestRepo = this.getLeaveRequestRepository(manager);
    const full = await requestRepo.findOne({
      where: { id: leaveRequest.id },
      relations: {
        employee: { company_user: { user: true } },
        leave_type: true,
      },
    });
    if (!full) return;

    const employeeName = `${full.employee.first_name} ${full.employee.last_name}`;
    const employeeEmail = full.employee.company_user?.user?.email ?? '';
    const appUrl = this.configService.get<string>('APP_FRONTEND_URL')!;
    const dashboardUrl = `${appUrl}/dashboard/me/leave/requests?highlight=${full.id}`;

    if (full.status === LeaveStatusEnum.APPROVED) {
      this.eventEmitter.emit(
        LeaveApprovedEvent.EVENT,
        new LeaveApprovedEvent(
          employeeName,
          employeeEmail,
          full.leave_type.name,
          full.start_date,
          full.end_date,
          Number(full.total_days),
          dashboardUrl,
          full.id,
          full.company_id,
          actorCompanyUserId,
          full.employee.company_user?.id ?? null,
        ),
      );
      return;
    }

    if (full.status === LeaveStatusEnum.REJECTED) {
      this.eventEmitter.emit(
        LeaveRejectedEvent.EVENT,
        new LeaveRejectedEvent(
          employeeName,
          employeeEmail,
          full.leave_type.name,
          full.start_date,
          full.end_date,
          rejectionComments,
          dashboardUrl,
          full.id,
          full.company_id,
          actorCompanyUserId,
          full.employee.company_user?.id ?? null,
        ),
      );
      return;
    }

    if (full.status === LeaveStatusEnum.RETURNED_FOR_CORRECTION) {
      this.eventEmitter.emit(
        LeaveReturnedForCorrectionEvent.EVENT,
        new LeaveReturnedForCorrectionEvent(
          employeeName,
          employeeEmail,
          full.leave_type.name,
          full.start_date,
          full.end_date,
          full.return_reason,
          dashboardUrl,
          full.id,
          full.company_id,
          actorCompanyUserId,
          full.employee.company_user?.id ?? null,
        ),
      );
      return;
    }

    // Still pending (moved from dept-manager to HR) — notify next-level approvers
    const nextPendingApprovals = await approvalRepo.find({
      where: {
        leave_request_id: full.id,
        approval_level: full.current_approval_level,
        approval_cycle: full.approval_cycle,
        status: LeaveApprovalStatusEnum.PENDING,
      },
      relations: { approver: { user: true } },
    });

    const approvers = nextPendingApprovals.flatMap((approval) => {
      const recipient = buildNotificationRecipient(approval.approver?.user, {
        companyUserId: approval.approver?.id,
      });
      return recipient ? [recipient] : [];
    });

    if (approvers.length) {
      this.eventEmitter.emit(
        LeaveApprovalRequiredEvent.EVENT,
        new LeaveApprovalRequiredEvent(
          employeeName,
          full.leave_type.name,
          full.start_date,
          full.end_date,
          Number(full.total_days),
          approvers,
          `${appUrl}/dashboard/leave-management/requests?highlight=${full.id}`,
          full.id,
          full.company_id,
          actorCompanyUserId,
          full.approval_cycle,
        ),
      );
    }

    // Tell the employee their request progressed to the next approver.
    if (
      full.status === LeaveStatusEnum.PENDING_HR ||
      full.status === LeaveStatusEnum.IN_REVIEW
    ) {
      this.eventEmitter.emit(
        LeaveForwardedEvent.EVENT,
        new LeaveForwardedEvent(
          full.leave_type.name,
          full.status === LeaveStatusEnum.IN_REVIEW ? 'management' : 'HR',
          dashboardUrl,
          full.id,
          full.approval_cycle,
          full.current_approval_level,
          full.company_id,
          actorCompanyUserId,
          full.employee.company_user?.id ?? null,
        ),
      );
    }
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
      order: { approval_cycle: 'ASC', approval_level: 'ASC', id: 'ASC' },
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
