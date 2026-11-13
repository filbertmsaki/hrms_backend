import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import { NotificationPriorityEnum } from '../../notifications/enums/notification-priority.enum';
import { NotificationsService } from '../../notifications/notifications.service';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventsService } from '../../security/security-events.service';
import { AttendancePolicy } from '../attendance/policies/entities/attendance-policy.entity';
import { ShiftAssignmentsService } from '../attendance/shift/shift-assignments/shift-assignments.service';
import { ShiftAssignment } from '../attendance/shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftAssignmentStatusEnum } from '../attendance/shift/shift-assignments/enums/shift-assignment-status.enum';
import { Shift } from '../attendance/shift/shifts/entities/shift.entity';
import { ShiftStatusEnum } from '../attendance/shift/shifts/enums/shift-status.enum';
import { EmployeeTimetablesService } from '../attendance/timetable/employee-timetables/employee-timetables.service';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { EmployeeTimetableStatusEnum } from '../attendance/timetable/employee-timetables/enums/employee-timetable-status.enum';
import { Timetable } from '../attendance/timetable/timetables/entities/timetable.entity';
import { TimetableStatusEnum } from '../attendance/timetable/timetables/enums/timetable-status.enum';
import {
  ChangeEmployeeStatusDto,
  STATUS_EXIT_REASONS,
  SUSPENSION_PAY_STATUSES,
  SUSPENSION_REASONS,
  StatusChangeExitDto,
  StatusChangeScheduleDto,
  StatusChangeSuspensionDto,
  StatusExitReason,
} from '../employees/dtos/change-employee-status.dto';
import { EmployeeLifecycleService } from '../employees/employee-lifecycle.service';
import { EmployeesService } from '../employees/employees.service';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { EmployeeEmploymentEvent } from '../employment-history/entities/employee-employment-event.entity';
import { EmploymentEventTypeEnum } from '../employment-history/enums/employment-event-type.enum';
import { EmploymentHistoryService } from '../employment-history/employment-history.service';
import { LeavePolicy } from '../leave/entities/leave-policy.entity';
import { LeaveRecordStatusEnum } from '../leave/enums/leave-record-status.enum';
import { EmployeeAttendanceReadinessService } from '../launch-readiness/employee-attendance-readiness.service';
import { OffboardingExitInterview } from '../offboarding/entities/offboarding-exit-interview.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { OffboardingTask } from '../offboarding/entities/offboarding-task.entity';
import { OffboardingWorkflowStep } from '../offboarding/entities/offboarding-workflow-step.entity';
import { OffboardingExitInterviewStatusEnum } from '../offboarding/enums/offboarding-exit-interview-status.enum';
import { OffboardingRequestStatusEnum } from '../offboarding/enums/offboarding-request-status.enum';
import { OffboardingTaskStatusEnum } from '../offboarding/enums/offboarding-task-status.enum';
import { OffboardingTypeEnum } from '../offboarding/enums/offboarding-type.enum';
import { OffboardingService } from '../offboarding/offboarding.service';
import { OffboardingWorkflowService } from '../offboarding/services/offboarding-workflow.service';
import { OnboardingAttendanceModeEnum } from '../onboarding/enums/onboarding-attendance-mode.enum';
import {
  OnboardingProvisioningPayload,
  OnboardingService,
} from '../onboarding/onboarding.service';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { ProbationService } from '../probation/probation.service';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from '../contracts/entities/employment-contract.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { formatDateOnly } from '../shared/hr.utils';

type RequirementState = 'complete' | 'needs_input' | 'optional';

type Requirement = {
  key: string;
  label: string;
  required: boolean;
  state: RequirementState;
  description?: string;
  current?: unknown;
  default?: unknown;
  options?: unknown;
};

type StatusPath =
  | 'direct'
  | 'onboarding_completion'
  | 'offboarding_with_status'
  | 'offboarding_request';

const EMPTY_AUDIT_CONTEXT: AuditRequestContext = {
  ipAddress: null,
  userAgent: null,
  requestId: null,
};

const OPEN_OFFBOARDING_STATUSES_EXCLUDED = [
  OffboardingRequestStatusEnum.COMPLETED,
  OffboardingRequestStatusEnum.CANCELLED,
  OffboardingRequestStatusEnum.REJECTED,
];

const EXIT_REASON_TO_OFFBOARDING_TYPE: Record<
  StatusExitReason,
  OffboardingTypeEnum
> = {
  resignation: OffboardingTypeEnum.RESIGNATION,
  termination: OffboardingTypeEnum.TERMINATION,
  end_of_contract: OffboardingTypeEnum.CONTRACT_END,
  retirement: OffboardingTypeEnum.RETIREMENT,
  other: OffboardingTypeEnum.OTHER,
};

const EXIT_REASON_LABELS: Record<StatusExitReason, string> = {
  resignation: 'Resignation',
  termination: 'Termination',
  end_of_contract: 'End of contract',
  retirement: 'Retirement',
  other: 'Other',
};

const DEFAULT_EXIT_REASON_BY_STATUS: Partial<
  Record<EmploymentStatusEnum, StatusExitReason>
> = {
  [EmploymentStatusEnum.RESIGNED]: 'resignation',
  [EmploymentStatusEnum.TERMINATED]: 'termination',
  [EmploymentStatusEnum.RETIRED]: 'retirement',
  [EmploymentStatusEnum.DECEASED]: 'other',
  [EmploymentStatusEnum.EXITED]: 'resignation',
};

/**
 * Status that offboarding finalization will set (mirrors
 * OffboardingService.resolveFinalEmployeeStatus, which keys off the
 * offboarding type derived from the exit reason).
 */
function finalStatusForExit(
  target: EmploymentStatusEnum,
  reason: StatusExitReason,
): EmploymentStatusEnum {
  if (target === EmploymentStatusEnum.DECEASED) {
    return EmploymentStatusEnum.DECEASED;
  }
  switch (reason) {
    case 'resignation':
      return EmploymentStatusEnum.RESIGNED;
    case 'termination':
      return EmploymentStatusEnum.TERMINATED;
    case 'retirement':
      return EmploymentStatusEnum.RETIRED;
    default:
      return EmploymentStatusEnum.INACTIVE;
  }
}

const SUSPENSION_EXEMPT_REASON_PREFIX = 'Suspension:';

/**
 * Orchestrates an employee status change together with its prerequisites
 * (work schedule, onboarding completion, suspension effects, offboarding
 * request) in a single transaction. All writes go through the owning
 * module's existing services; this class only sequences them.
 */
@Injectable()
export class EmployeeStatusChangeService {
  private readonly logger = new Logger(EmployeeStatusChangeService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly employeesService: EmployeesService,
    private readonly lifecycleService: EmployeeLifecycleService,
    private readonly hrAccessService: HrAccessService,
    private readonly attendanceReadinessService: EmployeeAttendanceReadinessService,
    private readonly shiftAssignmentsService: ShiftAssignmentsService,
    private readonly employeeTimetablesService: EmployeeTimetablesService,
    private readonly onboardingService: OnboardingService,
    private readonly offboardingService: OffboardingService,
    private readonly offboardingWorkflowService: OffboardingWorkflowService,
    private readonly probationService: ProbationService,
    private readonly employmentHistoryService: EmploymentHistoryService,
    private readonly securityEventsService: SecurityEventsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------
  // Requirements / defaults
  // ---------------------------------------------------------------------

  async getRequirements(
    companyId: number,
    employeeId: number,
    target: EmploymentStatusEnum,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.loadEmployee(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const current = employee.employment_status;
    const allowedTargets = this.lifecycleService.allowedTargets(current);
    const canForceExit = this.lifecycleService.canForceExitStatus(actor);
    const today = formatDateOnly(new Date());
    const blocking: Array<{ key: string; label: string; link?: string }> = [];
    const requirements: Requirement[] = [];
    let path: StatusPath = 'direct';
    let pathNote: string | null = null;
    let onboardingRequestId: number | null = null;

    if (!this.lifecycleService.isTransitionAllowed(current, target)) {
      blocking.push({
        key: 'transition',
        label: `Status cannot change from ${current} to ${target}`,
      });
    }

    if (target === EmploymentStatusEnum.ACTIVE) {
      let provisioning: OnboardingProvisioningPayload | null = null;
      if (current === EmploymentStatusEnum.ONBOARDING) {
        path = 'onboarding_completion';
        pathNote =
          'The employee will be activated through the onboarding completion workflow.';
        const readiness =
          await this.onboardingService.getEmployeeActivationBlockers(
            companyId,
            employeeId,
          );
        onboardingRequestId = readiness.request?.id ?? null;
        provisioning = readiness.provisioning;
        const link = onboardingRequestId
          ? `/dashboard/employees/onboarding?tab=requests&request_id=${onboardingRequestId}`
          : '/dashboard/employees/onboarding';
        for (const blocker of readiness.blockers) {
          blocking.push({ ...blocker, link: blocker.link ?? link });
        }
      }

      requirements.push(
        await this.buildScheduleRequirement(
          companyId,
          employee,
          today,
          provisioning,
        ),
      );

      if (current !== EmploymentStatusEnum.ONBOARDING) {
        // Re-activation needs a valid contract; a still-valid one passes as is.
        const contract = await this.findValidContract(
          this.dataSource.manager,
          companyId,
          employeeId,
          today,
        );
        const contractsLink = `/dashboard/employees/contracts?employee_id=${employeeId}`;
        requirements.push({
          key: 'contract',
          label: 'Valid employment contract',
          required: true,
          state: contract ? 'complete' : 'needs_input',
          description: contract
            ? `Contract ${contract.referenceNo} is signed and covers the effective date${contract.endDate ? ` (ends ${contract.endDate})` : ''}.`
            : 'No signed, unexpired contract covers the effective date. Prepare and sign a contract (or renew the expired one) first.',
          current: contract
            ? {
                id: contract.id,
                reference_no: contract.referenceNo,
                start_date: contract.startDate,
                end_date: contract.endDate,
              }
            : null,
          default: contractsLink,
        });
        if (!contract)
          blocking.push({
            key: 'contract',
            label:
              'A signed employment contract covering the effective date is required',
            link: contractsLink,
          });
      }

      if (path === 'onboarding_completion') {
        requirements.push(
          ...(await this.buildPolicyRequirements(
            companyId,
            employee,
            provisioning,
          )),
        );
        const probation = await this.probationService.previewProbationEndDate(
          companyId,
          employee,
        );
        requirements.push({
          key: 'probation_end_date',
          label: 'Probation end date',
          required: false,
          state: 'optional',
          description: probation
            ? 'Calculated from the hire date and the matching probation policy; a probation case is opened on activation.'
            : 'Probation does not apply to this employment type.',
          current: employee.probation_end_date,
          default: probation?.end_date ?? null,
        });
      }
    } else if (target === EmploymentStatusEnum.SUSPENDED) {
      requirements.push(
        {
          key: 'suspension_reason',
          label: 'Suspension reason',
          required: true,
          state: 'needs_input',
          default: null,
          options: SUSPENSION_REASONS,
        },
        {
          key: 'suspension_dates',
          label: 'Suspension period',
          required: true,
          state: 'complete',
          default: { start_date: today, expected_end_date: null },
        },
        {
          key: 'pay_status',
          label: 'Pay status during suspension',
          required: true,
          state: 'complete',
          default: 'unpaid',
          options: SUSPENSION_PAY_STATUSES,
        },
        {
          key: 'suspension_actions',
          label: 'Suspension actions',
          required: false,
          state: 'optional',
          default: {
            pause_attendance: true,
            disable_login: Boolean(employee.company_user_id),
            notify_manager: Boolean(employee.reports_to),
          },
          current: {
            has_login: Boolean(employee.company_user_id),
            has_manager: Boolean(employee.reports_to),
          },
        },
      );
    } else if (this.lifecycleService.isExitStatus(target)) {
      path = canForceExit ? 'offboarding_with_status' : 'offboarding_request';
      pathNote = canForceExit
        ? 'An offboarding request will be created and the status changed now.'
        : 'An offboarding request will be created. The status changes when offboarding is finalized.';

      const openRequest = await this.dataSource
        .getRepository(OffboardingRequest)
        .findOne({
          where: {
            company_id: companyId,
            employee_id: employeeId,
            status: Not(In(OPEN_OFFBOARDING_STATUSES_EXCLUDED)),
          },
          order: { id: 'DESC' },
        });
      if (openRequest) {
        blocking.push({
          key: 'open_offboarding',
          label: `Offboarding ${openRequest.offboarding_code} is already open for this employee`,
          link: `/dashboard/employees/offboarding?request_id=${openRequest.id}`,
        });
      }

      const checklist = await this.buildOffboardingChecklist(companyId);
      if (!checklist.workflow) {
        blocking.push({
          key: 'offboarding_workflow',
          label: 'No active default offboarding workflow is configured',
          link: '/dashboard/employees/offboarding',
        });
      }

      requirements.push(
        {
          key: 'exit_dates',
          label: 'Exit date and last working day',
          required: true,
          state: 'complete',
          default: { exit_date: today, last_working_day: today },
        },
        {
          key: 'exit_reason',
          label: 'Exit reason',
          required: true,
          state: 'complete',
          default: DEFAULT_EXIT_REASON_BY_STATUS[target] ?? 'other',
          options: STATUS_EXIT_REASONS.map((value) => ({
            value,
            label: EXIT_REASON_LABELS[value],
          })),
        },
        {
          key: 'offboarding_checklist',
          label: 'Offboarding checklist',
          required: false,
          state: checklist.workflow ? 'optional' : 'needs_input',
          description: checklist.workflow
            ? `From the "${checklist.workflow.name}" offboarding workflow. Unticked items become pending tasks in the Offboarding tab.`
            : undefined,
          default: { completed_step_ids: [] },
          options: checklist.items,
        },
        {
          key: 'rehire_eligible',
          label: 'Rehire eligibility',
          required: true,
          state: 'complete',
          default: true,
        },
        {
          key: 'end_schedule',
          label: 'End current shift/timetable on the exit date',
          required: false,
          state: 'optional',
          default: true,
        },
      );
    }

    return {
      employee_id: employee.id,
      current_status: current,
      target_status: target,
      allowed_targets: allowedTargets,
      path,
      path_note: pathNote,
      blocking,
      requirements,
      context: {
        hire_date: employee.hire_date,
        branch_id: employee.primary_branch_id,
        department_id: employee.primary_department_id,
        onboarding_request_id: onboardingRequestId,
        can_force_exit: canForceExit,
        // Status offboarding finalization sets for each exit reason, so the
        // modal can say exactly what the status will become.
        final_status_by_exit_reason: this.lifecycleService.isExitStatus(target)
          ? Object.fromEntries(
              STATUS_EXIT_REASONS.map((reason) => [
                reason,
                finalStatusForExit(target, reason),
              ]),
            )
          : null,
        today,
      },
    };
  }

  private async buildScheduleRequirement(
    companyId: number,
    employee: Employee,
    today: string,
    provisioning: OnboardingProvisioningPayload | null,
  ): Promise<Requirement> {
    const [
      currentSchedule,
      shifts,
      timetables,
      defaultShiftId,
      defaultTimetable,
    ] = await Promise.all([
      this.findCurrentSchedule(companyId, employee.id, today),
      this.listShiftOptions(companyId, employee),
      this.listTimetableOptions(companyId, employee),
      this.findMostUsedShiftId(companyId, employee),
      this.findDefaultTimetableId(companyId, employee),
    ]);

    let current: {
      mode: 'shift' | 'timetable';
      id: number;
      name: string;
      effective_from: string | null;
      source: 'assignment' | 'onboarding_selection';
    } | null = currentSchedule;
    if (!current && provisioning) {
      if (
        provisioning.attendance_mode === OnboardingAttendanceModeEnum.SHIFT &&
        provisioning.shift_assignment
      ) {
        const shift = shifts.find(
          (row) => row.id === provisioning.shift_assignment?.shift_id,
        );
        current = {
          mode: 'shift' as const,
          id: provisioning.shift_assignment.shift_id,
          name:
            shift?.name ?? `Shift #${provisioning.shift_assignment.shift_id}`,
          effective_from: provisioning.shift_assignment.effective_from ?? null,
          source: 'onboarding_selection' as const,
        };
      } else if (
        provisioning.attendance_mode ===
          OnboardingAttendanceModeEnum.TIMETABLE &&
        provisioning.timetable_assignment
      ) {
        const timetable = timetables.find(
          (row) => row.id === provisioning.timetable_assignment?.timetable_id,
        );
        current = {
          mode: 'timetable' as const,
          id: provisioning.timetable_assignment.timetable_id,
          name:
            timetable?.name ??
            `Timetable #${provisioning.timetable_assignment.timetable_id}`,
          effective_from:
            provisioning.timetable_assignment.effective_from ?? null,
          source: 'onboarding_selection' as const,
        };
      }
    }

    const companyDefaultTimetable = timetables.find((row) => row.is_default);
    const defaultValue = defaultShiftId
      ? { mode: 'shift' as const, id: defaultShiftId }
      : defaultTimetable
        ? { mode: 'timetable' as const, id: defaultTimetable }
        : shifts[0]
          ? { mode: 'shift' as const, id: shifts[0].id }
          : timetables[0]
            ? { mode: 'timetable' as const, id: timetables[0].id }
            : null;

    return {
      key: 'work_schedule',
      label: 'Work schedule',
      required: true,
      state: current || companyDefaultTimetable ? 'complete' : 'needs_input',
      description: current
        ? undefined
        : companyDefaultTimetable
          ? `Covered by the company default timetable "${companyDefaultTimetable.name}". You can still assign a specific schedule.`
          : 'Activation requires an active shift or timetable assignment.',
      current,
      default: defaultValue,
      options: { shifts, timetables },
    };
  }

  private async buildPolicyRequirements(
    companyId: number,
    employee: Employee,
    provisioning: OnboardingProvisioningPayload | null,
  ): Promise<Requirement[]> {
    const [leavePolicies, attendancePolicies] = await Promise.all([
      this.dataSource.getRepository(LeavePolicy).find({
        where: { company_id: companyId, status: LeaveRecordStatusEnum.ACTIVE },
        order: { name: 'ASC' },
      }),
      this.dataSource.getRepository(AttendancePolicy).find({
        where: { company_id: companyId, is_active: true },
        order: { name: 'ASC' },
      }),
    ]);

    const scoreLeavePolicy = (policy: LeavePolicy) => {
      const checks: Array<[number | string | null, unknown]> = [
        [policy.applicable_branch_id, employee.primary_branch_id],
        [policy.applicable_department_id, employee.primary_department_id],
        [policy.applicable_position_id, employee.primary_position_id],
        [policy.applicable_employment_type, employee.employment_type],
      ];
      let score = 0;
      for (const [policyValue, employeeValue] of checks) {
        if (policyValue === null || policyValue === undefined) continue;
        if (policyValue !== employeeValue) return -1;
        score += 1;
      }
      return score;
    };
    const bestLeavePolicy = leavePolicies
      .map((policy) => ({ policy, score: scoreLeavePolicy(policy) }))
      .filter((row) => row.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.policy;
    const employeeAttendancePolicyId = Number(
      employee.metadata?.attendance_policy_id,
    );

    const leaveDefault = provisioning?.leave_policy_id ?? bestLeavePolicy?.id;
    const attendanceDefault =
      provisioning?.attendance_policy_id ??
      (Number.isFinite(employeeAttendancePolicyId) &&
      employeeAttendancePolicyId > 0
        ? employeeAttendancePolicyId
        : attendancePolicies[0]?.id);

    return [
      {
        key: 'leave_policy',
        label: 'Leave policy',
        required: false,
        state: 'optional',
        description:
          'Used to set up leave balances on activation. If none is selected, the standard matching rules apply.',
        default: leaveDefault ?? null,
        options: leavePolicies.map((row) => ({ id: row.id, name: row.name })),
      },
      {
        key: 'attendance_policy',
        label: 'Attendance policy',
        required: false,
        state: 'optional',
        default: attendanceDefault ?? null,
        options: attendancePolicies.map((row) => ({
          id: row.id,
          name: row.name,
        })),
      },
    ];
  }

  /** Signed, not ended, and covering the date. */
  private async findValidContract(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
    onDate: string,
  ) {
    return manager
      .getRepository(EmploymentContract)
      .createQueryBuilder('c')
      .where('c.companyId = :companyId AND c.employeeId = :employeeId', {
        companyId,
        employeeId,
      })
      .andWhere('c.status = :signed', {
        signed: EmploymentContractStatus.SIGNED,
      })
      .andWhere('c.startDate <= :onDate', { onDate })
      .andWhere('(c.endDate IS NULL OR c.endDate >= :onDate)', { onDate })
      .andWhere('(c.endedAt IS NULL OR c.endedAt > :onDate)', { onDate })
      .orderBy('c.version', 'DESC')
      .getOne();
  }

  private async buildOffboardingChecklist(companyId: number) {
    let workflow: { id: number; name: string } | null = null;
    try {
      const resolved = await this.offboardingWorkflowService.resolveWorkflow(
        companyId,
        null,
      );
      workflow = { id: resolved.id, name: resolved.name };
    } catch {
      return { workflow: null, items: [] };
    }
    const steps = await this.dataSource
      .getRepository(OffboardingWorkflowStep)
      .find({
        where: { workflow_id: workflow.id },
        order: { approval_level: 'ASC', id: 'ASC' },
      });
    return {
      workflow,
      items: steps.map((step) => ({
        step_id: step.id,
        title: step.task_title || step.step_name,
        description: step.task_description,
        task_type: step.task_type,
        required: step.is_required,
        // Evidence-backed or system-run steps must be completed in the
        // offboarding workspace, not ticked here.
        can_complete_now:
          !step.completion_evidence_required && !step.is_system_operation,
      })),
    };
  }

  private async findCurrentSchedule(
    companyId: number,
    employeeId: number,
    today: string,
    manager?: EntityManager,
  ) {
    const source = manager ?? this.dataSource.manager;
    const shift = await source
      .getRepository(ShiftAssignment)
      .createQueryBuilder('sa')
      .leftJoinAndSelect('sa.shift', 'shift')
      .where('sa.companyId = :companyId', { companyId })
      .andWhere('sa.employeeId = :employeeId', { employeeId })
      .andWhere('sa.status = :status', {
        status: ShiftAssignmentStatusEnum.ACTIVE,
      })
      .andWhere('(sa.effectiveTo IS NULL OR sa.effectiveTo >= :today)', {
        today,
      })
      .orderBy('sa.effectiveFrom', 'DESC')
      .getOne();
    if (shift) {
      return {
        mode: 'shift' as const,
        id: shift.shiftId,
        name: shift.shift?.name ?? `Shift #${shift.shiftId}`,
        effective_from: shift.effectiveFrom,
        source: 'assignment' as const,
      };
    }
    const timetable = await source
      .getRepository(EmployeeTimetable)
      .createQueryBuilder('et')
      .leftJoinAndSelect('et.timetable', 'timetable')
      .where('et.companyId = :companyId', { companyId })
      .andWhere('et.employeeId = :employeeId', { employeeId })
      .andWhere('et.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      })
      .andWhere('(et.effectiveTo IS NULL OR et.effectiveTo >= :today)', {
        today,
      })
      .orderBy('et.effectiveFrom', 'DESC')
      .getOne();
    if (timetable) {
      return {
        mode: 'timetable' as const,
        id: timetable.timetableId,
        name:
          timetable.timetable?.name ?? `Timetable #${timetable.timetableId}`,
        effective_from: timetable.effectiveFrom,
        source: 'assignment' as const,
      };
    }
    return null;
  }

  private async listShiftOptions(companyId: number, employee: Employee) {
    const qb = this.dataSource
      .getRepository(Shift)
      .createQueryBuilder('shift')
      .where('shift.companyId = :companyId', { companyId })
      .andWhere('shift.status = :status', { status: ShiftStatusEnum.ACTIVE })
      .andWhere('shift.deletedAt IS NULL');
    if (employee.primary_branch_id) {
      qb.andWhere('(shift.branchId IS NULL OR shift.branchId = :branchId)', {
        branchId: employee.primary_branch_id,
      });
    }
    if (employee.primary_department_id) {
      qb.andWhere(
        '(shift.departmentId IS NULL OR shift.departmentId = :departmentId)',
        { departmentId: employee.primary_department_id },
      );
    }
    const rows = await qb.orderBy('shift.name', 'ASC').getMany();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      start_time: row.startTime,
      end_time: row.endTime,
    }));
  }

  private async listTimetableOptions(companyId: number, employee: Employee) {
    const qb = this.dataSource
      .getRepository(Timetable)
      .createQueryBuilder('timetable')
      .where('timetable.companyId = :companyId', { companyId })
      .andWhere('timetable.status = :status', {
        status: TimetableStatusEnum.ACTIVE,
      })
      .andWhere('timetable.deletedAt IS NULL');
    if (employee.primary_branch_id) {
      qb.andWhere(
        '(timetable.branchId IS NULL OR timetable.branchId = :branchId)',
        { branchId: employee.primary_branch_id },
      );
    }
    const rows = await qb.orderBy('timetable.name', 'ASC').getMany();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      is_default: row.isDefault,
    }));
  }

  /**
   * Most-used active shift among active assignments of colleagues in the
   * same branch + department, falling back to branch only, then company.
   */
  private async findMostUsedShiftId(
    companyId: number,
    employee: Employee,
  ): Promise<number | null> {
    const scopes: Array<{
      branch?: number | null;
      department?: number | null;
    }> = [
      {
        branch: employee.primary_branch_id,
        department: employee.primary_department_id,
      },
      { branch: employee.primary_branch_id },
      {},
    ];
    for (const scope of scopes) {
      if (
        ('branch' in scope && !scope.branch) ||
        ('department' in scope && !scope.department)
      ) {
        continue;
      }
      const qb = this.dataSource
        .getRepository(ShiftAssignment)
        .createQueryBuilder('sa')
        .innerJoin('sa.employee', 'emp')
        .innerJoin('sa.shift', 'shift')
        .select('sa.shiftId', 'shiftId')
        .addSelect('COUNT(*)', 'uses')
        .where('sa.companyId = :companyId', { companyId })
        .andWhere('sa.status = :status', {
          status: ShiftAssignmentStatusEnum.ACTIVE,
        })
        .andWhere('shift.status = :shiftStatus', {
          shiftStatus: ShiftStatusEnum.ACTIVE,
        })
        .andWhere('shift.deletedAt IS NULL')
        .andWhere('(sa.effectiveTo IS NULL OR sa.effectiveTo >= CURRENT_DATE)');
      if (scope.branch) {
        qb.andWhere('emp.primary_branch_id = :branchId', {
          branchId: scope.branch,
        });
      }
      if (scope.department) {
        qb.andWhere('emp.primary_department_id = :departmentId', {
          departmentId: scope.department,
        });
      }
      const row = await qb
        .groupBy('sa.shiftId')
        .orderBy('uses', 'DESC')
        .addOrderBy('sa.shiftId', 'ASC')
        .limit(1)
        .getRawOne<{ shiftId: number }>();
      if (row?.shiftId) return Number(row.shiftId);
    }
    return null;
  }

  /** Timetable flagged as default, else the most used in the branch. */
  private async findDefaultTimetableId(
    companyId: number,
    employee: Employee,
  ): Promise<number | null> {
    const flagged = await this.dataSource.getRepository(Timetable).findOne({
      where: {
        companyId,
        isDefault: true,
        status: TimetableStatusEnum.ACTIVE,
      },
    });
    if (flagged) return flagged.id;
    const qb = this.dataSource
      .getRepository(EmployeeTimetable)
      .createQueryBuilder('et')
      .innerJoin('et.employee', 'emp')
      .select('et.timetableId', 'timetableId')
      .addSelect('COUNT(*)', 'uses')
      .where('et.companyId = :companyId', { companyId })
      .andWhere('et.status = :status', {
        status: EmployeeTimetableStatusEnum.ACTIVE,
      });
    if (employee.primary_branch_id) {
      qb.andWhere('emp.primary_branch_id = :branchId', {
        branchId: employee.primary_branch_id,
      });
    }
    const row = await qb
      .groupBy('et.timetableId')
      .orderBy('uses', 'DESC')
      .limit(1)
      .getRawOne<{ timetableId: number }>();
    return row?.timetableId ? Number(row.timetableId) : null;
  }

  // ---------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------

  async changeStatus(
    companyId: number,
    employeeId: number,
    dto: ChangeEmployeeStatusDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
  ) {
    const employee = await this.loadEmployee(companyId, employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const current = employee.employment_status;
    const target = dto.employment_status;
    const isExit = this.lifecycleService.isExitStatus(target);
    const canForceExit = this.lifecycleService.canForceExitStatus(actor);
    const exitThroughOffboarding = isExit && Boolean(dto.exit);

    // Existing transition + permission rules. Exits that carry offboarding
    // details are allowed without the force permission: they create an
    // offboarding request and the status is changed when it is finalized.
    if (exitThroughOffboarding && !canForceExit) {
      if (!this.lifecycleService.isTransitionAllowed(current, target)) {
        throw new BadRequestException(
          `Employee status cannot change from ${current} to ${target}`,
        );
      }
    } else {
      this.lifecycleService.assertTransition(current, target, actor);
    }

    this.validatePayload(dto, current);

    const effectiveDate = dto.effective_date.slice(0, 10);
    const outcome: {
      statusDeferred: boolean;
      onboardingCompleted: OnboardingRequest | null;
      offboardingRequest: OffboardingRequest | null;
      notifyManager: boolean;
    } = {
      statusDeferred: false,
      onboardingCompleted: null,
      offboardingRequest: null,
      notifyManager: false,
    };

    await this.dataSource.transaction(async (manager) => {
      const before = await manager.getRepository(Employee).findOneOrFail({
        where: { id: employeeId, company_id: companyId },
      });
      const eventValues: Record<string, unknown> = {
        employment_status: target,
        effective_date: effectiveDate,
      };
      let scheduleCreated: Record<string, unknown> | null = null;

      if (
        target === EmploymentStatusEnum.ACTIVE &&
        current === EmploymentStatusEnum.ONBOARDING
      ) {
        outcome.onboardingCompleted = await this.completeOnboardingActivation(
          manager,
          companyId,
          employeeId,
          dto,
          effectiveDate,
          actor,
        );
        scheduleCreated = dto.schedule
          ? {
              ...dto.schedule,
              effective_from: dto.schedule.effective_from ?? effectiveDate,
            }
          : null;
        await this.stampStatusChange(manager, employeeId, dto, actor);
        await this.logSecurityEvent(
          manager,
          companyId,
          before,
          target,
          dto,
          actor,
          context,
        );
      } else if (target === EmploymentStatusEnum.ACTIVE) {
        if (
          !(await this.findValidContract(
            manager,
            companyId,
            employeeId,
            effectiveDate,
          ))
        ) {
          throw this.fieldError(
            'contract',
            'Re-activation requires a signed, unexpired employment contract covering the effective date.',
          );
        }
        if (dto.schedule) {
          scheduleCreated = await this.assignSchedule(
            manager,
            companyId,
            employeeId,
            dto.schedule,
            effectiveDate,
            actor,
          );
        }
        const hasSchedule =
          await this.attendanceReadinessService.hasActiveSchedule(
            companyId,
            employeeId,
            manager,
          );
        if (!hasSchedule) {
          throw this.fieldError(
            'schedule.id',
            'Activation requires an active shift or timetable assignment.',
          );
        }
        if (current === EmploymentStatusEnum.SUSPENDED) {
          eventValues.suspension_lifted = await this.liftSuspensionEffects(
            manager,
            companyId,
            before,
          );
        }
        await this.employeesService.applyStatusChangeInTransaction(
          manager,
          companyId,
          employeeId,
          dto,
          actor,
          context,
        );
      } else if (target === EmploymentStatusEnum.SUSPENDED && dto.suspension) {
        const suspension = this.normalizeSuspension(
          dto.suspension,
          effectiveDate,
        );
        await this.employeesService.applyStatusChangeInTransaction(
          manager,
          companyId,
          employeeId,
          { ...dto, notes: this.composeSuspensionNotes(dto.notes, suspension) },
          actor,
          context,
        );
        eventValues.suspension = await this.applySuspensionEffects(
          manager,
          companyId,
          employeeId,
          suspension,
        );
        outcome.notifyManager = Boolean(suspension.notify_manager);
      } else if (exitThroughOffboarding && dto.exit) {
        const exit = dto.exit;
        const request = await this.createExitOffboarding(
          manager,
          companyId,
          employee,
          target,
          exit,
          dto.notes,
          actor,
        );
        outcome.offboardingRequest = request;
        eventValues.exit = {
          exit_date: exit.exit_date,
          last_working_day: exit.last_working_day,
          reason: exit.reason,
          reason_details: exit.reason_details ?? null,
          rehire_eligible: exit.rehire_eligible ?? null,
          completed_step_ids: exit.completed_step_ids ?? [],
          offboarding_request_id: request.id,
          offboarding_code: request.offboarding_code,
        };
        if (canForceExit) {
          await this.employeesService.applyStatusChangeInTransaction(
            manager,
            companyId,
            employeeId,
            {
              ...dto,
              exit_date: exit.exit_date,
              exit_reason: this.exitReasonText(exit),
            },
            actor,
            context,
          );
          if (exit.end_schedule !== false) {
            eventValues.schedule_ended = await this.endSchedules(
              manager,
              companyId,
              employeeId,
              exit.exit_date,
            );
          }
        } else {
          outcome.statusDeferred = true;
          eventValues.pending_status = finalStatusForExit(target, exit.reason);
        }
      } else {
        await this.employeesService.applyStatusChangeInTransaction(
          manager,
          companyId,
          employeeId,
          dto,
          actor,
          context,
        );
      }

      if (scheduleCreated) eventValues.schedule = scheduleCreated;
      if (dto.activation) eventValues.activation = dto.activation;
      if (dto.notes?.trim()) eventValues.notes = dto.notes.trim();

      await this.recordEmploymentEvent(
        manager,
        companyId,
        employeeId,
        before,
        target,
        effectiveDate,
        eventValues,
        outcome.statusDeferred,
        actor,
      );
    });

    // Post-commit side effects (never roll back the saved change).
    if (outcome.onboardingCompleted) {
      await this.onboardingService
        .afterOnboardingCompleted(companyId, outcome.onboardingCompleted, actor)
        .catch((error: unknown) =>
          this.logger.warn(
            `Onboarding post-completion failed: ${String(error)}`,
          ),
        );
    }
    if (outcome.offboardingRequest) {
      await this.offboardingService
        .logOffboardingRequestCreated(outcome.offboardingRequest, actor, {
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        })
        .catch((error: unknown) =>
          this.logger.warn(`Offboarding audit failed: ${String(error)}`),
        );
    }
    if (outcome.notifyManager) {
      await this.notifyManager(companyId, employee, dto);
    }

    const saved = await this.employeesService.findOne(
      companyId,
      employeeId,
      actor,
    );
    return {
      ...saved,
      status_change: {
        status_deferred: outcome.statusDeferred,
        offboarding_request_id: outcome.offboardingRequest?.id ?? null,
        offboarding_code: outcome.offboardingRequest?.offboarding_code ?? null,
        onboarding_request_id: outcome.onboardingCompleted?.id ?? null,
      },
    };
  }

  private validatePayload(
    dto: ChangeEmployeeStatusDto,
    current: EmploymentStatusEnum,
  ) {
    const errors: Record<string, string> = {};
    const target = dto.employment_status;
    if (dto.schedule && target !== EmploymentStatusEnum.ACTIVE) {
      errors.schedule = 'A work schedule can only be assigned on activation.';
    }
    if (
      dto.activation &&
      !(
        target === EmploymentStatusEnum.ACTIVE &&
        current === EmploymentStatusEnum.ONBOARDING
      )
    ) {
      errors.activation =
        'Leave and attendance policies can only be set when activating from onboarding.';
    }
    if (dto.suspension && target !== EmploymentStatusEnum.SUSPENDED) {
      errors.suspension = 'Suspension details require the suspended status.';
    }
    if (dto.exit && !this.lifecycleService.isExitStatus(target)) {
      errors.exit = 'Exit details require an exit status.';
    }
    if (dto.suspension) {
      const start = dto.suspension.start_date ?? dto.effective_date;
      if (
        dto.suspension.expected_end_date &&
        dto.suspension.expected_end_date.slice(0, 10) < start.slice(0, 10)
      ) {
        errors['suspension.expected_end_date'] =
          'Expected end date cannot be before the start date.';
      }
    }
    if (dto.exit) {
      if (
        dto.exit.last_working_day.slice(0, 10) > dto.exit.exit_date.slice(0, 10)
      ) {
        errors['exit.last_working_day'] =
          'Last working day cannot be after the exit date.';
      }
      if (dto.exit.reason === 'other' && !dto.exit.reason_details?.trim()) {
        errors['exit.reason_details'] =
          'Describe the exit reason when "Other" is selected.';
      }
    }
    if (Object.keys(errors).length) {
      throw new UnprocessableEntityException({
        message: Object.values(errors)[0],
        field_errors: errors,
      });
    }
  }

  private async completeOnboardingActivation(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
    dto: ChangeEmployeeStatusDto,
    effectiveDate: string,
    actor: AuthenticatedUser,
  ): Promise<OnboardingRequest> {
    const readiness =
      await this.onboardingService.getEmployeeActivationBlockers(
        companyId,
        employeeId,
      );
    if (!readiness.request) {
      throw this.fieldError(
        'employment_status',
        'No open onboarding request exists for this employee.',
      );
    }
    if (readiness.blockers.length) {
      throw new UnprocessableEntityException({
        message: `Onboarding is not ready for activation: ${readiness.blockers
          .map((row) => row.label)
          .join(', ')}`,
        field_errors: {
          onboarding: readiness.blockers.map((row) => row.label).join(', '),
        },
      });
    }

    const requestId = readiness.request.id;
    const override: Partial<OnboardingProvisioningPayload> = {};
    if (dto.schedule) {
      const effectiveFrom = dto.schedule.effective_from ?? effectiveDate;
      if (dto.schedule.mode === 'shift') {
        override.attendance_mode = OnboardingAttendanceModeEnum.SHIFT;
        override.shift_assignment = {
          shift_id: dto.schedule.id,
          effective_from: effectiveFrom,
        };
        override.timetable_assignment = undefined;
      } else {
        override.attendance_mode = OnboardingAttendanceModeEnum.TIMETABLE;
        override.timetable_assignment = {
          timetable_id: dto.schedule.id,
          effective_from: effectiveFrom,
        };
        override.shift_assignment = undefined;
      }
    } else {
      const hasSchedule =
        readiness.provisioning?.shift_assignment ||
        readiness.provisioning?.timetable_assignment ||
        (await this.attendanceReadinessService.hasActiveSchedule(
          companyId,
          employeeId,
          manager,
        ));
      if (!hasSchedule) {
        throw this.fieldError(
          'schedule.id',
          'Activation requires an active shift or timetable assignment.',
        );
      }
    }
    if (dto.activation?.leave_policy_id) {
      override.leave_policy_id = dto.activation.leave_policy_id;
    }
    if (dto.activation?.attendance_policy_id) {
      override.attendance_policy_id = dto.activation.attendance_policy_id;
    }

    const completed = await this.withField(
      (message) =>
        /shift|timetable|schedule/i.test(message)
          ? 'schedule.id'
          : /leave policy/i.test(message)
            ? 'activation.leave_policy_id'
            : /attendance policy/i.test(message)
              ? 'activation.attendance_policy_id'
              : 'onboarding',
      () =>
        this.onboardingService.finalizeOnboardingInTransaction(
          manager,
          companyId,
          requestId,
          actor,
          { provisioningOverride: override },
        ),
    );
    if (!completed) {
      throw new ConflictException('Onboarding is already completed.');
    }
    return completed;
  }

  private async assignSchedule(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
    schedule: StatusChangeScheduleDto,
    effectiveDate: string,
    actor: AuthenticatedUser,
  ) {
    const effectiveFrom = (schedule.effective_from ?? effectiveDate).slice(
      0,
      10,
    );
    if (schedule.mode === 'shift') {
      const created = await this.withField('schedule.id', () =>
        this.shiftAssignmentsService.create(
          companyId,
          {
            employee_id: employeeId,
            shift_id: schedule.id,
            effective_from: effectiveFrom,
            effective_to: null,
            is_primary: true,
            status: ShiftAssignmentStatusEnum.ACTIVE,
            assigned_by: actor.companyMembershipId ?? null,
          },
          manager,
        ),
      );
      return {
        mode: 'shift',
        id: schedule.id,
        effective_from: effectiveFrom,
        assignment_id: created.id,
      };
    }
    const created = await this.withField('schedule.id', () =>
      this.employeeTimetablesService.create(
        companyId,
        {
          employee_id: employeeId,
          timetable_id: schedule.id,
          effective_from: effectiveFrom,
          effective_to: null,
          status: EmployeeTimetableStatusEnum.ACTIVE,
          assigned_by: actor.companyMembershipId ?? null,
        },
        manager,
      ),
    );
    return {
      mode: 'timetable',
      id: schedule.id,
      effective_from: effectiveFrom,
      assignment_id: (created as { id?: number }).id ?? null,
    };
  }

  private normalizeSuspension(
    suspension: StatusChangeSuspensionDto,
    effectiveDate: string,
  ) {
    return {
      reason: suspension.reason,
      start_date: (suspension.start_date ?? effectiveDate).slice(0, 10),
      expected_end_date: suspension.expected_end_date
        ? suspension.expected_end_date.slice(0, 10)
        : null,
      pay_status: suspension.pay_status,
      pause_attendance: suspension.pause_attendance ?? true,
      disable_login: suspension.disable_login ?? true,
      notify_manager: suspension.notify_manager ?? true,
    };
  }

  private composeSuspensionNotes(
    notes: string | undefined,
    suspension: ReturnType<EmployeeStatusChangeService['normalizeSuspension']>,
  ) {
    const summary = [
      `Suspension: ${suspension.reason}`,
      `from ${suspension.start_date}`,
      suspension.expected_end_date
        ? `expected until ${suspension.expected_end_date}`
        : 'open-ended',
      `pay: ${suspension.pay_status}`,
    ].join(', ');
    const body = notes?.trim();
    return body ? `${body}\n\n[${summary}]` : `[${summary}]`;
  }

  private async applySuspensionEffects(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
    suspension: ReturnType<EmployeeStatusChangeService['normalizeSuspension']>,
  ) {
    const employeeRepository = manager.getRepository(Employee);
    const employee = await employeeRepository.findOneOrFail({
      where: { id: employeeId, company_id: companyId },
    });
    let loginPreviousStatus: string | null = null;

    if (suspension.pause_attendance) {
      employee.attendance_exempt_from = suspension.start_date;
      employee.attendance_exempt_reason =
        `${SUSPENSION_EXEMPT_REASON_PREFIX} ${suspension.reason}`.slice(0, 255);
      await employeeRepository.save(employee);
    }

    if (suspension.disable_login && employee.company_user_id) {
      const membershipRepository = manager.getRepository(CompanyUser);
      const membership = await membershipRepository.findOne({
        where: { id: employee.company_user_id, company_id: companyId },
      });
      if (membership) {
        loginPreviousStatus = membership.status;
        if (membership.status === 'active') {
          membership.status = 'inactive';
          await membershipRepository.save(membership);
        }
      }
    }

    return { ...suspension, login_previous_status: loginPreviousStatus };
  }

  /** Reverses what applySuspensionEffects did for the latest suspension. */
  private async liftSuspensionEffects(
    manager: EntityManager,
    companyId: number,
    employee: Employee,
  ) {
    const lifted = { attendance_resumed: false, login_restored: false };
    const employeeRepository = manager.getRepository(Employee);
    if (
      employee.attendance_exempt_reason?.startsWith(
        SUSPENSION_EXEMPT_REASON_PREFIX,
      )
    ) {
      await employeeRepository.update(employee.id, {
        attendance_exempt_from: null,
        attendance_exempt_reason: null,
      });
      lifted.attendance_resumed = true;
    }

    const lastSuspension = await manager
      .getRepository(EmployeeEmploymentEvent)
      .createQueryBuilder('event')
      .where('event.company_id = :companyId', { companyId })
      .andWhere('event.employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('event.event_type = :type', {
        type: EmploymentEventTypeEnum.STATUS_CHANGED,
      })
      .andWhere(`event.new_values ->> 'employment_status' = :status`, {
        status: EmploymentStatusEnum.SUSPENDED,
      })
      .orderBy('event.id', 'DESC')
      .getOne();
    const suspension = lastSuspension?.new_values?.suspension as
      | { disable_login?: boolean; login_previous_status?: string | null }
      | undefined;
    if (
      suspension?.disable_login &&
      suspension.login_previous_status === 'active' &&
      employee.company_user_id
    ) {
      const membershipRepository = manager.getRepository(CompanyUser);
      const membership = await membershipRepository.findOne({
        where: { id: employee.company_user_id, company_id: companyId },
      });
      if (membership && membership.status === 'inactive') {
        membership.status = 'active';
        await membershipRepository.save(membership);
        lifted.login_restored = true;
      }
    }
    return lifted;
  }

  private exitReasonText(exit: StatusChangeExitDto) {
    const label = EXIT_REASON_LABELS[exit.reason];
    const details = exit.reason_details?.trim();
    return details ? `${label}: ${details}` : label;
  }

  private async createExitOffboarding(
    manager: EntityManager,
    companyId: number,
    employee: Employee,
    target: EmploymentStatusEnum,
    exit: StatusChangeExitDto,
    notes: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<OffboardingRequest> {
    const offboardingType =
      target === EmploymentStatusEnum.DECEASED
        ? OffboardingTypeEnum.DECEASED
        : EXIT_REASON_TO_OFFBOARDING_TYPE[exit.reason];

    const created = (await this.withField('exit', () =>
      this.offboardingService.createOffboardingRequest(
        companyId,
        {
          employee_id: employee.id,
          title: `${EXIT_REASON_LABELS[exit.reason]} - status change to ${target}`,
          description: notes?.trim() || undefined,
          offboarding_type: offboardingType,
          reason: this.exitReasonText(exit),
          last_working_date: exit.last_working_day.slice(0, 10),
          submit: true,
          metadata: {
            source: 'employee_status_change',
            target_status: target,
            exit_date: exit.exit_date.slice(0, 10),
            rehire_eligible: exit.rehire_eligible ?? null,
            end_schedule: exit.end_schedule !== false,
          },
        },
        actor,
        undefined,
        manager,
      ),
    )) as OffboardingRequest;

    const completedStepIds = new Set(exit.completed_step_ids ?? []);
    if (completedStepIds.size) {
      const taskRepository = manager.getRepository(OffboardingTask);
      const tasks = await taskRepository.find({
        where: {
          offboarding_request_id: created.id,
          workflow_step_id: In([...completedStepIds]),
        },
      });
      const blocked = tasks.filter((task) => task.completion_evidence_required);
      if (blocked.length) {
        throw this.fieldError(
          'exit.completed_step_ids',
          `These items need evidence and must be completed in the Offboarding tab: ${blocked
            .map((task) => task.title)
            .join(', ')}`,
        );
      }
      const now = new Date();
      for (const task of tasks) {
        task.status = OffboardingTaskStatusEnum.COMPLETED;
        task.completed_at = now;
        task.completed_by_company_user_id = actor.companyMembershipId ?? null;
        task.completion_data = {
          ...(task.completion_data ?? {}),
          source: 'employee_status_change',
        };
      }
      await taskRepository.save(tasks);
      await this.offboardingService.updateRequestProgress(created, manager);
    }

    const interviewRepository = manager.getRepository(OffboardingExitInterview);
    const interview =
      (await interviewRepository.findOne({
        where: { offboarding_request_id: created.id },
      })) ??
      interviewRepository.create({
        offboarding_request_id: created.id,
        status: OffboardingExitInterviewStatusEnum.DRAFT,
      });
    interview.rehire_eligible = exit.rehire_eligible ?? null;
    interview.exit_reason_category = exit.reason;
    await interviewRepository.save(interview);

    return created;
  }

  /** Ends open schedules on the exit date; future-dated ones are deactivated. */
  private async endSchedules(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
    exitDate: string,
  ) {
    const date = exitDate.slice(0, 10);
    const shiftRepository = manager.getRepository(ShiftAssignment);
    const timetableRepository = manager.getRepository(EmployeeTimetable);
    const [shifts, timetables] = await Promise.all([
      shiftRepository.find({
        where: {
          companyId,
          employeeId,
          status: ShiftAssignmentStatusEnum.ACTIVE,
        },
      }),
      timetableRepository.find({
        where: {
          companyId,
          employeeId,
          status: EmployeeTimetableStatusEnum.ACTIVE,
        },
      }),
    ]);
    let ended = 0;
    for (const row of shifts) {
      if (row.effectiveTo && row.effectiveTo <= date) continue;
      if (row.effectiveFrom > date) {
        row.status = ShiftAssignmentStatusEnum.INACTIVE;
      } else {
        row.effectiveTo = date;
      }
      ended += 1;
    }
    for (const row of timetables) {
      if (row.effectiveTo && row.effectiveTo <= date) continue;
      if (row.effectiveFrom > date) {
        row.status = EmployeeTimetableStatusEnum.INACTIVE;
      } else {
        row.effectiveTo = date;
      }
      ended += 1;
    }
    await shiftRepository.save(shifts);
    await timetableRepository.save(timetables);
    return { end_date: date, assignments_updated: ended };
  }

  private async stampStatusChange(
    manager: EntityManager,
    employeeId: number,
    dto: ChangeEmployeeStatusDto,
    actor: AuthenticatedUser,
  ) {
    await manager.getRepository(Employee).update(employeeId, {
      status_changed_at: new Date(),
      status_changed_by_company_user_id: actor.companyMembershipId ?? null,
      exit_date: null,
      exit_reason: null,
      ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
    });
  }

  private async logSecurityEvent(
    manager: EntityManager,
    companyId: number,
    before: Employee,
    target: EmploymentStatusEnum,
    dto: ChangeEmployeeStatusDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
  ) {
    await this.securityEventsService.log(
      {
        eventType: SecurityEventType.EMPLOYEE_STATUS_CHANGED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor,
        companyId,
        targetCompanyUserId: before.company_user_id,
        resourceType: 'employee',
        resourceId: before.id,
        oldValues: {
          employment_status: before.employment_status,
          notes: before.notes,
          status_changed_at: before.status_changed_at,
        },
        newValues: {
          employment_status: target,
          effective_date: dto.effective_date,
          via: 'onboarding_completion',
        },
        context,
      },
      manager,
    );
  }

  private async recordEmploymentEvent(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
    before: Employee,
    target: EmploymentStatusEnum,
    effectiveDate: string,
    newValues: Record<string, unknown>,
    deferred: boolean,
    actor: AuthenticatedUser,
  ) {
    const from = before.employment_status;
    const isExit = this.lifecycleService.isExitStatus(target);
    const eventType = deferred
      ? EmploymentEventTypeEnum.OTHER
      : isExit
        ? EmploymentEventTypeEnum.EXITED
        : EmploymentEventTypeEnum.STATUS_CHANGED;
    const pendingStatus =
      typeof newValues.pending_status === 'string'
        ? newValues.pending_status
        : target;
    const title = deferred
      ? `Offboarding started (status will change to ${pendingStatus} when finalized)`
      : `Status changed from ${from} to ${target}`;
    await this.employmentHistoryService.record(
      {
        companyId,
        employeeId,
        eventType,
        effectiveDate,
        title,
        description:
          typeof newValues.notes === 'string' ? newValues.notes : null,
        sourceModule: 'employees',
        sourceEntityType: 'employee_status',
        sourceEntityId: employeeId,
        oldValues: {
          employment_status: from,
          exit_date: before.exit_date,
          exit_reason: before.exit_reason,
        },
        newValues: deferred
          ? {
              ...newValues,
              employment_status: from,
              pending_status: pendingStatus,
            }
          : newValues,
        actorCompanyUserId: actor.companyMembershipId ?? null,
      },
      manager,
    );
  }

  private async notifyManager(
    companyId: number,
    employee: Employee,
    dto: ChangeEmployeeStatusDto,
  ) {
    if (!employee.reports_to) return;
    try {
      const managerEmployee = await this.dataSource
        .getRepository(Employee)
        .findOne({
          where: { id: employee.reports_to, company_id: companyId },
        });
      if (!managerEmployee?.company_user_id) return;
      const name = this.employeeName(employee);
      const suspension = dto.suspension;
      await this.notificationsService.createAndPush({
        company_id: companyId,
        receiver_company_user_id: managerEmployee.company_user_id,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.HIGH,
        title: `${name} has been suspended`,
        message: suspension
          ? `Suspended from ${suspension.start_date ?? dto.effective_date}${
              suspension.expected_end_date
                ? ` until ${suspension.expected_end_date}`
                : ''
            } (${suspension.reason}).`
          : `Suspended from ${dto.effective_date}.`,
        related_module: 'employees',
        entity_type: 'employee',
        entity_id: employee.id,
        action_url: `/dashboard/employees/${employee.id}`,
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
      });
    } catch (error) {
      this.logger.warn(
        `Suspension notification for employee ${employee.id} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private employeeName(employee: Employee) {
    const user = (
      employee as Employee & {
        company_user?: { user?: { first_name?: string; last_name?: string } };
      }
    ).company_user?.user;
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ');
    return name || employee.employee_no || `Employee #${employee.id}`;
  }

  private async loadEmployee(companyId: number, employeeId: number) {
    const employee = await this.dataSource.getRepository(Employee).findOne({
      where: { id: employeeId, company_id: companyId },
      relations: {
        department_assignments: true,
        primary_department: true,
        primary_position: true,
        company_user: { user: true },
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  private fieldError(field: string, message: string) {
    return new UnprocessableEntityException({
      message,
      field_errors: { [field]: message },
    });
  }

  /**
   * Runs a step and re-labels validation-type failures from downstream
   * services with the modal field they relate to.
   */
  private async withField<T>(
    field: string | ((message: string) => string),
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      if (error instanceof ForbiddenException) throw error;
      const status = error.getStatus();
      if (![400, 404, 409, 422].includes(status)) throw error;
      const raw = error.getResponse();
      if (typeof raw === 'object' && raw !== null && 'field_errors' in raw) {
        throw error;
      }
      const rawMessage =
        typeof raw === 'string'
          ? raw
          : ((raw as { message?: unknown })?.message ?? error.message);
      const message = Array.isArray(rawMessage)
        ? rawMessage.map((item) => String(item)).join('; ')
        : typeof rawMessage === 'string'
          ? rawMessage
          : error.message;
      throw this.fieldError(
        typeof field === 'function' ? field(message) : field,
        message,
      );
    }
  }
}
