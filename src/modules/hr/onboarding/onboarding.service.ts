import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { CompanyUserRole } from '../../companies/entities/company-user-role.entity';
import { Role } from '../../roles/entities/role.entity';
import { ShiftSchedule } from '../attendance/shift/shift-schedules/entities/shift-schedule.entity';
import { ShiftSchedulesService } from '../attendance/shift/shift-schedules/shift-schedules.service';
import { EmployeeTimetableStatusEnum } from '../attendance/timetable/employee-timetables/enums/employee-timetable-status.enum';
import { EmployeeTimetablesService } from '../attendance/timetable/employee-timetables/employee-timetables.service';
import { EmployeeTimetable } from '../attendance/timetable/employee-timetables/entities/employee-timetable.entity';
import { Branch } from '../branches/entities/branch.entity';
import { CompanyUserBranchAccess } from '../branches/entities/company-user-branch-access.entity';
import { Document } from '../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { Department } from '../departments/entities/department.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeBankAccount } from '../employees/entities/employee-bank-account.entity';
import { EmployeePayrollProfile } from '../payroll/entities/employee-payroll-profile.entity';
import { EmployeeCompensationVersion, EmployeeCompensationVersionStatusEnum } from '../employee-movements/entities/employee-compensation-version.entity';
import { EmploymentContract, EmploymentContractStatus } from '../contracts/entities/employment-contract.entity';
import { LeaveType } from '../leave/entities/leave-type.entity';
import { LeaveRecordStatusEnum } from '../leave/enums/leave-record-status.enum';
import { LeaveBalanceService } from '../leave/services/leave-balance.service';
import { EmployeeDeviceAssignmentsService } from '../../access-control/employee-device-assignments/service/employee-device-assignments.service';
import { EmployeeDeviceAssignment } from '../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { buildPaginationMeta, formatDateOnly } from '../shared/hr.utils';
import { CancelOnboardingRequestDto } from './dtos/cancel-onboarding-request.dto';
import { AcknowledgeOnboardingDto } from './dtos/acknowledge-onboarding.dto';
import { CloneOnboardingWorkflowDto } from './dtos/clone-onboarding-workflow.dto';
import { CompleteOnboardingTaskDto } from './dtos/complete-onboarding-task.dto';
import { CreateOnboardingRequestDto } from './dtos/create-onboarding-request.dto';
import { CreateOnboardingTaskDto } from './dtos/create-onboarding-task.dto';
import { CreateOnboardingWorkflowStepDto } from './dtos/create-onboarding-workflow-step.dto';
import { CreateOnboardingWorkflowDto } from './dtos/create-onboarding-workflow.dto';
import { DelegateOnboardingApprovalDto } from './dtos/delegate-onboarding-approval.dto';
import { OnboardingProvisioningDto } from './dtos/onboarding-provisioning.dto';
import { OnboardingApprovalActionDto } from './dtos/onboarding-approval-action.dto';
import { OnboardingRequestQueryDto } from './dtos/onboarding-request-query.dto';
import { ReviewOnboardingEmployeeDetailsDto } from './dtos/review-onboarding-employee-details.dto';
import { StartOnboardingWorkflowDto } from './dtos/start-onboarding-workflow.dto';
import { OnboardingWorkflowQueryDto } from './dtos/onboarding-workflow-query.dto';
import { OnboardingWorkflowStepInputDto } from './dtos/onboarding-workflow-step-input.dto';
import { UpdateOnboardingRequestDto } from './dtos/update-onboarding-request.dto';
import { UpdateOnboardingWorkflowStepDto } from './dtos/update-onboarding-workflow-step.dto';
import { UpdateOnboardingWorkflowDto } from './dtos/update-onboarding-workflow.dto';
import { UploadDocumentDto } from './dtos/upload-document.dto';
import { VerifyDocumentDto } from './dtos/verify-document.dto';
import { OnboardingApprovalStatusEnum } from './enums/onboarding-approval-status.enum';
import { OnboardingAttendanceModeEnum } from './enums/onboarding-attendance-mode.enum';
import { OnboardingStepTypeEnum } from './enums/onboarding-step-type.enum';
import { OnboardingRecordStatusEnum } from './enums/onboarding-record-status.enum';
import { OnboardingRequestStatusEnum } from './enums/onboarding-request-status.enum';
import { OnboardingTaskStatusEnum } from './enums/onboarding-task-status.enum';
import { OnboardingTaskTypeEnum } from './enums/onboarding-task-type.enum';
import { OnboardingApproval } from './entities/onboarding-approval.entity';
import { OnboardingAuditLog } from './entities/onboarding-audit-log.entity';
import { OnboardingNumberSequence } from './entities/onboarding-number-sequence.entity';
import { OnboardingRequest } from './entities/onboarding-request.entity';
import { OnboardingTask } from './entities/onboarding-task.entity';
import { OnboardingWorkflowStep } from './entities/onboarding-workflow-step.entity';
import { OnboardingWorkflow } from './entities/onboarding-workflow.entity';
import { OnboardingAuditService } from './services/onboarding-audit.service';
import {
  OnboardingApproverFailure,
  OnboardingWorkflowService,
} from './services/onboarding-workflow.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  NotificationRecipient,
  OnboardingCompletedEvent,
  OnboardingApprovalRequiredEvent,
  OnboardingEmployeeDetailsReviewedEvent,
  OnboardingEmployeeDetailsReturnedEvent,
  OnboardingEmployeeDetailsSubmittedEvent,
  OnboardingSubmittedEvent,
  OnboardingTaskAssignedEvent,
  OnboardingTaskCompletedEvent,
} from '../notifications/events';
import { buildNotificationRecipient } from '../notifications/notification-recipient.util';
import { FilesService } from '../../files/files.service';
import { ProbationService } from '../probation/probation.service';
import {
  HR_PRIVATE_DOCUMENT_MAX_BYTES,
  HR_PRIVATE_DOCUMENT_MIME_TYPES,
} from '../../files/file-policy';

type ProgressSummary = {
  total_tasks: number;
  completed_tasks: number;
  total_approvals: number;
  approved_approvals: number;
  progress_percentage: string;
};

type EmployeeDetailReviewDecision = {
  status: 'pending' | 'approved' | 'changes_requested';
  comment: string | null;
  reviewed_at: string | null;
  reviewed_by_company_user_id: number | null;
};

const EMPLOYEE_DETAIL_SECTIONS = [
  ['personal', 'Personal details'],
  ['assignment', 'Employment assignment'],
  ['contacts', 'Contacts and addresses'],
  ['family', 'Emergency contacts and relatives'],
  ['identification', 'Identification'],
  ['banking', 'Banking details'],
  ['education', 'Education and qualifications'],
  ['experience', 'Work experience'],
] as const;

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type OnboardingProvisioningPayload = {
  role_ids?: number[];
  branch_access_ids?: number[];
  attendance_mode?: OnboardingAttendanceModeEnum;
  shift_assignment?: {
    shift_id: number;
    effective_from?: string;
    effective_to?: string | null;
    rotation_group_id?: number | null;
    is_primary?: boolean;
  };
  timetable_assignment?: {
    timetable_id: number;
    effective_from?: string;
    effective_to?: string | null;
  };
  device_assignment?: {
    employee_no?: string;
    access_group_id: number;
    organization_id?: number;
    valid_enabled?: boolean;
    valid_begin_time?: string;
    valid_end_time?: string;
    local_ui_right?: boolean;
    close_delay_enabled?: boolean;
    max_open_door_time?: number;
    open_door_time?: number;
    user_verify_mode?: string;
    metadata?: Record<string, unknown>;
    device_ids: number[];
    sync_now?: boolean;
    continue_on_error?: boolean;
  };
};

const EMPTY_AUDIT_CONTEXT: AuditRequestContext = {
  ipAddress: null,
  userAgent: null,
  requestId: null,
};

export type OnboardingCreationResult = OnboardingRequest & {
  warning: string | null;
  warning_details: OnboardingApproverFailure[];
};

@Injectable()
export class OnboardingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(OnboardingWorkflow)
    private readonly onboardingWorkflowRepository: Repository<OnboardingWorkflow>,
    @InjectRepository(OnboardingWorkflowStep)
    private readonly onboardingWorkflowStepRepository: Repository<OnboardingWorkflowStep>,
    @InjectRepository(OnboardingRequest)
    private readonly onboardingRequestRepository: Repository<OnboardingRequest>,
    @InjectRepository(OnboardingTask)
    private readonly onboardingTaskRepository: Repository<OnboardingTask>,
    @InjectRepository(OnboardingApproval)
    private readonly onboardingApprovalRepository: Repository<OnboardingApproval>,
    @InjectRepository(OnboardingAuditLog)
    private readonly onboardingAuditLogRepository: Repository<OnboardingAuditLog>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(CompanyUserRole)
    private readonly companyUserRoleRepository: Repository<CompanyUserRole>,
    @InjectRepository(CompanyUserBranchAccess)
    private readonly branchAccessRepository: Repository<CompanyUserBranchAccess>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(ShiftSchedule)
    private readonly shiftScheduleRepository: Repository<ShiftSchedule>,
    @InjectRepository(EmployeeTimetable)
    private readonly employeeTimetableRepository: Repository<EmployeeTimetable>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
    private readonly hrAccessService: HrAccessService,
    private readonly onboardingAuditService: OnboardingAuditService,
    private readonly onboardingWorkflowService: OnboardingWorkflowService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly shiftSchedulesService: ShiftSchedulesService,
    private readonly employeeTimetablesService: EmployeeTimetablesService,
    private readonly employeeDeviceAssignmentsService: EmployeeDeviceAssignmentsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
    private readonly probationService: ProbationService,
  ) {}

  private getOnboardingWorkflowRepository(
    manager?: EntityManager,
  ): Repository<OnboardingWorkflow> {
    return (
      manager?.getRepository(OnboardingWorkflow) ??
      this.onboardingWorkflowRepository
    );
  }

  private getOnboardingWorkflowStepRepository(
    manager?: EntityManager,
  ): Repository<OnboardingWorkflowStep> {
    return (
      manager?.getRepository(OnboardingWorkflowStep) ??
      this.onboardingWorkflowStepRepository
    );
  }

  private getOnboardingRequestRepository(
    manager?: EntityManager,
  ): Repository<OnboardingRequest> {
    return (
      manager?.getRepository(OnboardingRequest) ??
      this.onboardingRequestRepository
    );
  }

  private getOnboardingTaskRepository(
    manager?: EntityManager,
  ): Repository<OnboardingTask> {
    return (
      manager?.getRepository(OnboardingTask) ?? this.onboardingTaskRepository
    );
  }

  private getOnboardingApprovalRepository(
    manager?: EntityManager,
  ): Repository<OnboardingApproval> {
    return (
      manager?.getRepository(OnboardingApproval) ??
      this.onboardingApprovalRepository
    );
  }

  private getEmployeeRepository(manager?: EntityManager): Repository<Employee> {
    return manager?.getRepository(Employee) ?? this.employeeRepository;
  }

  private getDepartmentRepository(
    manager?: EntityManager,
  ): Repository<Department> {
    return manager?.getRepository(Department) ?? this.departmentRepository;
  }

  private getBranchRepository(manager?: EntityManager): Repository<Branch> {
    return manager?.getRepository(Branch) ?? this.branchRepository;
  }

  private getCompanyUserRepository(
    manager?: EntityManager,
  ): Repository<CompanyUser> {
    return manager?.getRepository(CompanyUser) ?? this.companyUserRepository;
  }

  private getRoleRepository(manager?: EntityManager): Repository<Role> {
    return manager?.getRepository(Role) ?? this.roleRepository;
  }

  private getCompanyUserRoleRepository(
    manager?: EntityManager,
  ): Repository<CompanyUserRole> {
    return (
      manager?.getRepository(CompanyUserRole) ?? this.companyUserRoleRepository
    );
  }

  private getBranchAccessRepository(
    manager?: EntityManager,
  ): Repository<CompanyUserBranchAccess> {
    return (
      manager?.getRepository(CompanyUserBranchAccess) ??
      this.branchAccessRepository
    );
  }

  private getShiftScheduleRepository(
    manager?: EntityManager,
  ): Repository<ShiftSchedule> {
    return (
      manager?.getRepository(ShiftSchedule) ?? this.shiftScheduleRepository
    );
  }

  private getEmployeeTimetableRepository(
    manager?: EntityManager,
  ): Repository<EmployeeTimetable> {
    return (
      manager?.getRepository(EmployeeTimetable) ??
      this.employeeTimetableRepository
    );
  }

  private getEmployeeDeviceAssignmentRepository(
    manager?: EntityManager,
  ): Repository<EmployeeDeviceAssignment> {
    return (
      manager?.getRepository(EmployeeDeviceAssignment) ??
      this.employeeDeviceAssignmentRepository
    );
  }

  private getDocumentRepository(manager?: EntityManager): Repository<Document> {
    return manager?.getRepository(Document) ?? this.documentRepository;
  }

  private getOnboardingNumberSequenceRepository(
    manager?: EntityManager,
  ): Repository<OnboardingNumberSequence> {
    return (
      manager?.getRepository(OnboardingNumberSequence) ??
      this.dataSource.getRepository(OnboardingNumberSequence)
    );
  }

  private assertWorkflowEditable(workflow: OnboardingWorkflow): void {
    if (workflow.is_locked) {
      throw new ConflictException(
        'This onboarding workflow is locked because it has already been used. Clone it to make changes.',
      );
    }
  }

  private resolveWorkflowTaskType(
    stepType: OnboardingStepTypeEnum,
    taskType?: OnboardingTaskTypeEnum | null,
  ): OnboardingTaskTypeEnum {
    switch (stepType) {
      case OnboardingStepTypeEnum.DOCUMENT:
        return OnboardingTaskTypeEnum.DOCUMENT;
      case OnboardingStepTypeEnum.ACKNOWLEDGEMENT:
        return OnboardingTaskTypeEnum.ACKNOWLEDGEMENT;
      case OnboardingStepTypeEnum.SYSTEM_ACTION:
        return OnboardingTaskTypeEnum.SYSTEM;
      default:
        return taskType ?? OnboardingTaskTypeEnum.GENERAL;
    }
  }

  private readWorkflowChecklistItems(
    metadata: Record<string, unknown> | null | undefined,
  ): Array<{ name: string; description: string }> {
    const raw = metadata?.checklist_items ?? metadata?.checklistItems;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .map((item) => {
        if (typeof item === 'string') {
          const name = item.trim();
          return name ? { name, description: '' } : null;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const record = item as Record<string, unknown>;
        const name = typeof record.name === 'string' ? record.name.trim() : '';
        const description =
          typeof record.description === 'string'
            ? record.description.trim()
            : '';
        return name ? { name, description } : null;
      })
      .filter(
        (item): item is { name: string; description: string } => item !== null,
      );
  }

  private validateWorkflowStepRules(
    step: OnboardingWorkflowStepInputDto,
  ): void {
    if (
      !step.assigned_role_id &&
      !step.assigned_user_id &&
      !step.assigned_department_id
    ) {
      throw new BadRequestException(
        `Step "${step.name}" must have assigned_role_id, assigned_user_id, or assigned_department_id`,
      );
    }

    const rawChecklist =
      step.metadata?.checklist_items ?? step.metadata?.checklistItems;
    if (rawChecklist !== undefined) {
      const checklistItems = this.readWorkflowChecklistItems(step.metadata);
      if (
        !Array.isArray(rawChecklist) ||
        rawChecklist.length === 0 ||
        rawChecklist.length > 50 ||
        checklistItems.length !== rawChecklist.length ||
        checklistItems.some(
          (item) => item.name.length > 120 || item.description.length > 1000,
        )
      ) {
        throw new BadRequestException(
          `Step "${step.name}" checklist must contain 1 to 50 named items; names may be at most 120 characters and descriptions at most 1000 characters`,
        );
      }
    }

    if (
      step.step_type === OnboardingStepTypeEnum.DOCUMENT &&
      !this.normalizeOptionalString(step.required_document_type_code)
    ) {
      throw new BadRequestException(
        `Document step "${step.name}" must define required_document_type_code`,
      );
    }

    if (
      step.step_type === OnboardingStepTypeEnum.SIGN_OFF &&
      (step.required_document_type_code ||
        step.requires_verified_document ||
        step.completion_evidence_required ||
        step.requires_employee_acknowledgement)
    ) {
      throw new BadRequestException(
        `Sign-off step "${step.name}" cannot require task-side document or acknowledgement metadata`,
      );
    }
  }

  private buildWorkflowSnapshot(
    workflow: OnboardingWorkflow,
  ): Record<string, unknown> {
    return {
      id: workflow.id,
      root_workflow_id: workflow.root_workflow_id ?? workflow.id,
      version: workflow.version,
      name: workflow.name,
      description: workflow.description,
      steps: workflow.steps.map((step) => ({
        id: step.id,
        step_order: step.step_order,
        name: step.name,
        description: step.description,
        step_type: step.step_type,
        task_type: step.task_type,
        assigned_role_id: step.assigned_role_id,
        assigned_user_id: step.assigned_user_id,
        assigned_department_id: step.assigned_department_id,
        is_required: step.is_required,
        due_days: step.due_days,
        required_document_type_code: step.required_document_type_code,
        requires_verified_document: step.requires_verified_document,
        completion_evidence_required: step.completion_evidence_required,
        requires_employee_acknowledgement:
          step.requires_employee_acknowledgement,
        metadata: step.metadata,
      })),
    };
  }

  private async lockWorkflowIfNeeded(
    workflow: OnboardingWorkflow,
    manager?: EntityManager,
  ): Promise<void> {
    if (workflow.is_locked) {
      return;
    }

    workflow.is_locked = true;
    workflow.locked_at = new Date();
    await this.getOnboardingWorkflowRepository(manager).save(workflow);
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private assertDateOrder(
    startDate: string,
    endDate: string,
    message: string,
  ): void {
    if (new Date(startDate) > new Date(endDate)) {
      throw new BadRequestException(message);
    }
  }

  private async findEmployeeOrFail(
    companyId: number,
    employeeId: number,
    manager?: EntityManager,
  ): Promise<Employee> {
    const repository = this.getEmployeeRepository(manager);
    const employee = await repository.findOne({
      where: { id: employeeId },
      relations: {
        company_user: true,
        primary_department: true,
        primary_position: true,
      },
    });

    if (
      !employee ||
      (employee.company_id ?? employee.company_user?.company_id) !== companyId
    ) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async initializeLeaveBalancesForEmployee(
    companyId: number,
    employee: Employee,
    manager: EntityManager,
  ): Promise<void> {
    const leaveTypeRepository = manager.getRepository(LeaveType);
    const leaveTypes = await leaveTypeRepository.find({
      where: {
        company_id: companyId,
        status: LeaveRecordStatusEnum.ACTIVE,
      },
    });

    if (!leaveTypes.length) {
      return;
    }

    const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
      employee.hire_date ?? formatDateOnly(new Date()),
    );

    for (const leaveType of leaveTypes) {
      await this.leaveBalanceService.ensureBalanceForEmployee(
        companyId,
        employee,
        leaveType.id,
        fiscalYear,
        manager,
      );
    }
  }

  private async ensureNoActiveOnboarding(
    companyId: number,
    employeeId: number,
    manager?: EntityManager,
    ignoreOnboardingRequestId?: number,
  ): Promise<void> {
    const repository = this.getOnboardingRequestRepository(manager);
    const qb = repository
      .createQueryBuilder('onboardingRequest')
      .where('onboardingRequest.company_id = :companyId', { companyId })
      .andWhere('onboardingRequest.employee_id = :employeeId', { employeeId })
      .andWhere('onboardingRequest.status IN (:...statuses)', {
        statuses: [
          OnboardingRequestStatusEnum.DRAFT,
          OnboardingRequestStatusEnum.SUBMITTED,
          OnboardingRequestStatusEnum.IN_REVIEW,
          OnboardingRequestStatusEnum.IN_PROGRESS,
          OnboardingRequestStatusEnum.READY_FOR_ACTIVATION,
          OnboardingRequestStatusEnum.ACTIVATING,
          OnboardingRequestStatusEnum.ACTIVATION_FAILED,
        ],
      });

    if (ignoreOnboardingRequestId) {
      qb.andWhere('onboardingRequest.id != :ignoreOnboardingRequestId', {
        ignoreOnboardingRequestId,
      });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException({
        message: `Employee already has active onboarding request ${existing.onboarding_no}`,
        onboarding_request_id: existing.id,
        onboarding_request: {
          id: existing.id,
          employee_id: existing.employee_id,
          onboarding_no: existing.onboarding_no,
          status: existing.status,
        },
      });
    }
  }

  private async generateOnboardingNo(
    companyId: number,
    manager?: EntityManager,
  ): Promise<string> {
    const repository = this.getOnboardingNumberSequenceRepository(manager);
    const year = new Date().getFullYear();
    const prefix = `ONB-${year}-`;
    let sequence = await repository
      .createQueryBuilder('sequence')
      .setLock('pessimistic_write')
      .where('sequence.company_id = :companyId', { companyId })
      .andWhere('sequence.sequence_year = :year', { year })
      .getOne();

    if (!sequence) {
      try {
        sequence = await repository.save(
          repository.create({
            company_id: companyId,
            sequence_year: year,
            next_number: 2,
          }),
        );
        return `${prefix}${String(1).padStart(6, '0')}`;
      } catch {
        sequence = await repository
          .createQueryBuilder('sequence')
          .setLock('pessimistic_write')
          .where('sequence.company_id = :companyId', { companyId })
          .andWhere('sequence.sequence_year = :year', { year })
          .getOneOrFail();
      }
    }

    const currentNumber = sequence.next_number;
    sequence.next_number += 1;
    await repository.save(sequence);

    return `${prefix}${String(currentNumber).padStart(6, '0')}`;
  }

  private buildDefaultOnboardingTitle(employee: Employee): string {
    return `Onboarding - ${employee.first_name} ${employee.last_name}`.trim();
  }

  private normalizeProvisioning(
    provisioning?:
      | OnboardingProvisioningDto
      | OnboardingProvisioningPayload
      | null,
  ): OnboardingProvisioningPayload | null {
    if (!provisioning) {
      return null;
    }

    const uniqueNumbers = (values?: number[]) =>
      values?.length
        ? [
            ...new Set(
              values.filter((value) => Number.isInteger(value) && value > 0),
            ),
          ]
        : undefined;

    const normalized: OnboardingProvisioningPayload = {};
    const roleIds = uniqueNumbers(provisioning.role_ids);
    if (roleIds?.length) {
      normalized.role_ids = roleIds;
    }

    const branchAccessIds = uniqueNumbers(provisioning.branch_access_ids);
    if (branchAccessIds?.length) {
      normalized.branch_access_ids = branchAccessIds;
    }

    if (provisioning.attendance_mode) {
      normalized.attendance_mode = provisioning.attendance_mode;
    }

    if (provisioning.shift_assignment) {
      normalized.shift_assignment = {
        shift_id: provisioning.shift_assignment.shift_id,
        effective_from: provisioning.shift_assignment.effective_from,
        effective_to: provisioning.shift_assignment.effective_to ?? null,
        rotation_group_id:
          provisioning.shift_assignment.rotation_group_id ?? null,
        is_primary: provisioning.shift_assignment.is_primary ?? false,
      };
    }

    if (provisioning.timetable_assignment) {
      normalized.timetable_assignment = {
        timetable_id: provisioning.timetable_assignment.timetable_id,
        effective_from: provisioning.timetable_assignment.effective_from,
        effective_to: provisioning.timetable_assignment.effective_to ?? null,
      };
    }

    if (provisioning.device_assignment) {
      normalized.device_assignment = {
        employee_no:
          this.normalizeOptionalString(
            provisioning.device_assignment.employee_no,
          ) ?? undefined,
        access_group_id: provisioning.device_assignment.access_group_id,
        organization_id:
          provisioning.device_assignment.organization_id ?? undefined,
        valid_enabled: provisioning.device_assignment.valid_enabled,
        valid_begin_time: provisioning.device_assignment.valid_begin_time,
        valid_end_time: provisioning.device_assignment.valid_end_time,
        local_ui_right: provisioning.device_assignment.local_ui_right,
        close_delay_enabled: provisioning.device_assignment.close_delay_enabled,
        max_open_door_time: provisioning.device_assignment.max_open_door_time,
        open_door_time: provisioning.device_assignment.open_door_time,
        user_verify_mode:
          this.normalizeOptionalString(
            provisioning.device_assignment.user_verify_mode,
          ) ?? undefined,
        metadata: provisioning.device_assignment.metadata ?? undefined,
        device_ids:
          uniqueNumbers(provisioning.device_assignment.device_ids) ?? [],
        sync_now: provisioning.device_assignment.sync_now,
        continue_on_error: provisioning.device_assignment.continue_on_error,
      };
    }

    if (!Object.keys(normalized).length) {
      return null;
    }

    const hasShift = Boolean(normalized.shift_assignment);
    const hasTimetable = Boolean(normalized.timetable_assignment);

    if (hasShift && hasTimetable) {
      throw new BadRequestException(
        'Select only one attendance setup: shift_assignment or timetable_assignment',
      );
    }

    if (!normalized.attendance_mode) {
      if (hasShift) {
        normalized.attendance_mode = OnboardingAttendanceModeEnum.SHIFT;
      } else if (hasTimetable) {
        normalized.attendance_mode = OnboardingAttendanceModeEnum.TIMETABLE;
      }
    }

    if (
      normalized.attendance_mode === OnboardingAttendanceModeEnum.SHIFT &&
      !normalized.shift_assignment
    ) {
      throw new BadRequestException(
        'shift_assignment is required when attendance_mode is shift',
      );
    }

    if (
      normalized.attendance_mode === OnboardingAttendanceModeEnum.TIMETABLE &&
      !normalized.timetable_assignment
    ) {
      throw new BadRequestException(
        'timetable_assignment is required when attendance_mode is timetable',
      );
    }

    return normalized;
  }

  private withProvisioningMetadata(
    metadata: Record<string, unknown> | null | undefined,
    provisioning?:
      | OnboardingProvisioningDto
      | OnboardingProvisioningPayload
      | null,
  ): Record<string, unknown> | null {
    const normalizedProvisioning = this.normalizeProvisioning(provisioning);
    const nextMetadata = { ...(metadata ?? {}) };

    if (normalizedProvisioning) {
      nextMetadata.provisioning = normalizedProvisioning;
    } else {
      delete nextMetadata.provisioning;
    }

    return Object.keys(nextMetadata).length ? nextMetadata : null;
  }

  private readProvisioningMetadata(
    request: Pick<OnboardingRequest, 'metadata'>,
  ): OnboardingProvisioningPayload | null {
    return this.normalizeProvisioning(
      (request.metadata?.provisioning as
        | OnboardingProvisioningPayload
        | undefined) ?? null,
    );
  }

  private resolveProvisioningEffectiveFrom(
    request: Pick<OnboardingRequest, 'planned_start_date'>,
    employee: Pick<Employee, 'hire_date'>,
    explicitDate?: string,
  ): string {
    return (
      explicitDate ??
      request.planned_start_date ??
      employee.hire_date ??
      formatDateOnly(new Date())
    );
  }

  private async assignProvisioningRoles(
    companyId: number,
    employee: Employee,
    provisioning: OnboardingProvisioningPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (!provisioning.role_ids?.length) {
      return;
    }
    if (employee.company_user_id === null) {
      throw new BadRequestException(
        'Employee must have a linked company account before assigning roles',
      );
    }

    const roleRepository = this.getRoleRepository(manager);
    const roles = await roleRepository.find({
      where: { id: In(provisioning.role_ids) },
      select: ['id', 'company_id'],
    });

    if (roles.length !== provisioning.role_ids.length) {
      throw new BadRequestException('One or more selected roles are invalid');
    }

    const invalidRole = roles.find(
      (role) => role.company_id !== null && role.company_id !== companyId,
    );
    if (invalidRole) {
      throw new BadRequestException(
        `Role ${invalidRole.id} is not available in this company`,
      );
    }

    const roleAssignmentRepository = this.getCompanyUserRoleRepository(manager);
    for (const roleId of provisioning.role_ids) {
      const existing = await roleAssignmentRepository.findOne({
        where: {
          company_user_id: employee.company_user_id,
          role_id: roleId,
        },
      });

      if (!existing) {
        await roleAssignmentRepository.save(
          roleAssignmentRepository.create({
            company_user_id: employee.company_user_id,
            role_id: roleId,
          }),
        );
      }
    }
  }

  private async assignProvisioningBranchAccess(
    companyId: number,
    employee: Employee,
    provisioning: OnboardingProvisioningPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (!provisioning.branch_access_ids?.length) {
      return;
    }
    if (employee.company_user_id === null) {
      throw new BadRequestException(
        'Employee must have a linked company account before assigning branch access',
      );
    }

    const branchIds = provisioning.branch_access_ids;
    const branches = await this.getBranchRepository(manager).count({
      where: {
        id: In(branchIds),
        company_id: companyId,
      },
    });

    if (branches !== branchIds.length) {
      throw new BadRequestException(
        'One or more selected branch access assignments are invalid',
      );
    }

    const branchAccessRepository = this.getBranchAccessRepository(manager);
    for (const branchId of branchIds) {
      const existing = await branchAccessRepository.findOne({
        where: {
          company_user_id: employee.company_user_id,
          branch_id: branchId,
        },
      });

      if (!existing) {
        await branchAccessRepository.save(
          branchAccessRepository.create({
            company_user_id: employee.company_user_id,
            branch_id: branchId,
          }),
        );
      }
    }
  }

  private async assignProvisioningShift(
    companyId: number,
    request: Pick<OnboardingRequest, 'planned_start_date'>,
    employee: Employee,
    provisioning: OnboardingProvisioningPayload,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (!provisioning.shift_assignment) {
      return;
    }

    const effectiveFrom = this.resolveProvisioningEffectiveFrom(
      request,
      employee,
      provisioning.shift_assignment.effective_from,
    );
    const effectiveTo = provisioning.shift_assignment.effective_to ?? null;

    const existingQuery = this.getShiftScheduleRepository()
      .createQueryBuilder('schedule')
      .where('schedule.company_id = :companyId', { companyId })
      .andWhere('schedule.employee_id = :employeeId', {
        employeeId: employee.id,
      })
      .andWhere('schedule.shift_id = :shiftId', {
        shiftId: provisioning.shift_assignment.shift_id,
      })
      .andWhere('schedule.effective_from = :effectiveFrom', { effectiveFrom });

    if (effectiveTo) {
      existingQuery.andWhere('schedule.effective_to = :effectiveTo', {
        effectiveTo,
      });
    } else {
      existingQuery.andWhere('schedule.effective_to IS NULL');
    }

    const existing = await existingQuery.getOne();

    if (existing) {
      return;
    }

    await this.shiftSchedulesService.create(companyId, {
      employee_id: employee.id,
      shift_id: provisioning.shift_assignment.shift_id,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      assigned_by: actor.companyMembershipId ?? null,
      remarks:
        'Provisioned from onboarding workflow as centralized shift override',
    });
  }

  private async assignProvisioningTimetable(
    companyId: number,
    request: Pick<OnboardingRequest, 'planned_start_date'>,
    employee: Employee,
    provisioning: OnboardingProvisioningPayload,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (!provisioning.timetable_assignment) {
      return;
    }

    const effectiveFrom = this.resolveProvisioningEffectiveFrom(
      request,
      employee,
      provisioning.timetable_assignment.effective_from,
    );

    const existing = await this.getEmployeeTimetableRepository().findOne({
      where: {
        companyId,
        employeeId: employee.id,
        timetableId: provisioning.timetable_assignment.timetable_id,
        effectiveFrom,
      },
    });

    if (existing) {
      return;
    }

    await this.employeeTimetablesService.create(companyId, {
      employee_id: employee.id,
      timetable_id: provisioning.timetable_assignment.timetable_id,
      effective_from: effectiveFrom,
      effective_to: provisioning.timetable_assignment.effective_to ?? null,
      status: EmployeeTimetableStatusEnum.ACTIVE,
      assigned_by: actor.companyMembershipId ?? null,
    });
  }

  private async assignProvisioningDevices(
    companyId: number,
    employee: Employee,
    provisioning: OnboardingProvisioningPayload,
  ): Promise<void> {
    if (!provisioning.device_assignment?.device_ids.length) {
      return;
    }

    const missingDeviceIds: number[] = [];
    for (const deviceId of provisioning.device_assignment.device_ids) {
      const existing =
        await this.getEmployeeDeviceAssignmentRepository().findOne({
          where: {
            companyId,
            employeeId: employee.id,
            deviceId,
          },
        });

      if (!existing) {
        missingDeviceIds.push(deviceId);
      }
    }

    if (!missingDeviceIds.length) {
      return;
    }

    await this.employeeDeviceAssignmentsService.assignDevices(
      companyId,
      employee.id,
      {
        employee_no: provisioning.device_assignment.employee_no,
        access_group_id: provisioning.device_assignment.access_group_id,
        organization_id: provisioning.device_assignment.organization_id,
        valid_enabled: provisioning.device_assignment.valid_enabled,
        valid_begin_time: provisioning.device_assignment.valid_begin_time,
        valid_end_time: provisioning.device_assignment.valid_end_time,
        local_ui_right: provisioning.device_assignment.local_ui_right,
        close_delay_enabled: provisioning.device_assignment.close_delay_enabled,
        max_open_door_time: provisioning.device_assignment.max_open_door_time,
        open_door_time: provisioning.device_assignment.open_door_time,
        user_verify_mode: provisioning.device_assignment.user_verify_mode,
        metadata: provisioning.device_assignment.metadata,
        device_ids: missingDeviceIds,
        sync_now: provisioning.device_assignment.sync_now ?? true,
        continue_on_error:
          provisioning.device_assignment.continue_on_error ?? false,
      },
    );
  }

  private async applyProvisioningSelections(
    companyId: number,
    request: OnboardingRequest,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    const provisioning = this.readProvisioningMetadata(request);
    if (!provisioning) {
      return;
    }

    const employee = await this.getEmployeeRepository(manager).findOneOrFail({
      where: { id: request.employee_id },
      relations: { company_user: true },
    });

    await this.assignProvisioningRoles(
      companyId,
      employee,
      provisioning,
      manager,
    );
    await this.assignProvisioningBranchAccess(
      companyId,
      employee,
      provisioning,
      manager,
    );

    if (provisioning.attendance_mode === OnboardingAttendanceModeEnum.SHIFT) {
      await this.assignProvisioningShift(
        companyId,
        request,
        employee,
        provisioning,
        actor,
      );
    }

    if (
      provisioning.attendance_mode === OnboardingAttendanceModeEnum.TIMETABLE
    ) {
      await this.assignProvisioningTimetable(
        companyId,
        request,
        employee,
        provisioning,
        actor,
      );
    }

    await this.assignProvisioningDevices(companyId, employee, provisioning);
  }

  private async generateTaskNo(
    onboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<string> {
    const repository = this.getOnboardingTaskRepository(manager);
    const total = await repository.count({
      where: { onboarding_request_id: onboardingRequestId },
    });
    return `TASK-${onboardingRequestId}-${String(total + 1).padStart(3, '0')}`;
  }

  private async validateWorkflowStepReferences(
    companyId: number,
    steps: OnboardingWorkflowStepInputDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const userIds = steps
      .map((s) => s.assigned_user_id)
      .filter((v): v is number => typeof v === 'number');
    const roleIds = steps
      .map((s) => s.assigned_role_id)
      .filter((v): v is number => typeof v === 'number');
    const departmentIds = steps
      .map((s) => s.assigned_department_id)
      .filter((v): v is number => typeof v === 'number');

    if (userIds.length) {
      const uniqueUserIds = [...new Set(userIds)];
      const memberships = await this.getCompanyUserRepository(manager).find({
        where: {
          id: In(uniqueUserIds),
          company_id: companyId,
          status: 'active',
        },
        relations: {
          user: true,
          role_assignments: {
            role: {
              permissions: true,
            },
          },
          permission_assignments: {
            permission: true,
          },
        },
      });
      if (memberships.length !== uniqueUserIds.length) {
        throw new BadRequestException('One or more assigned users are invalid');
      }

      const membershipById = new Map(
        memberships.map((membership) => [membership.id, membership]),
      );

      for (const step of steps) {
        if (!step.assigned_user_id) {
          continue;
        }

        const membership = membershipById.get(step.assigned_user_id);
        if (!membership) {
          continue;
        }

        const requiredPermission =
          step.step_type === OnboardingStepTypeEnum.SIGN_OFF
            ? 'onboarding_requests:approve'
            : 'onboarding_tasks:complete';
        const permissionNames = new Set<string>();

        membership.permission_assignments?.forEach((assignment) => {
          if (assignment.permission?.name) {
            permissionNames.add(assignment.permission.name);
          }
        });
        membership.role_assignments?.forEach((assignment) => {
          assignment.role?.permissions?.forEach((permission) => {
            if (permission?.name) {
              permissionNames.add(permission.name);
            }
          });
        });

        if (!hasPermission(Array.from(permissionNames), requiredPermission)) {
          const assigneeName = [
            membership.user?.first_name,
            membership.user?.last_name,
          ]
            .filter(Boolean)
            .join(' ')
            .trim();
          throw new BadRequestException({
            statusCode: 400,
            code: 'ONBOARDING_ASSIGNEE_PERMISSION_REQUIRED',
            message: `${assigneeName || `User #${membership.user_id}`} cannot be assigned to "${step.name}" because they do not have ${requiredPermission}.`,
            assigned_user_id: membership.id,
            required_permission: requiredPermission,
            permission_fix_path: `/dashboard/companies?membership_id=${membership.id}&permission=${encodeURIComponent(requiredPermission)}`,
          });
        }
      }
    }

    if (roleIds.length) {
      const count = await this.getRoleRepository(manager).count({
        where: { id: In([...new Set(roleIds)]) },
      });
      if (count !== new Set(roleIds).size) {
        throw new BadRequestException('One or more assigned roles are invalid');
      }
    }

    if (departmentIds.length) {
      const count = await this.getDepartmentRepository(manager).count({
        where: {
          id: In([...new Set(departmentIds)]),
          company_id: companyId,
        },
      });
      if (count !== new Set(departmentIds).size) {
        throw new BadRequestException(
          'One or more assigned departments are invalid',
        );
      }
    }

    for (const step of steps) {
      this.validateWorkflowStepRules(step);
    }
  }

  private mapWorkflow(entity: OnboardingWorkflow) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      name: entity.name,
      description: entity.description,
      version: entity.version,
      root_workflow_id: entity.root_workflow_id,
      is_default: entity.is_default,
      is_locked: entity.is_locked,
      locked_at: entity.locked_at,
      created_by_company_user_id: entity.created_by_company_user_id,
      status: entity.status,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      steps: entity.steps?.map((step) => this.mapWorkflowStep(step)) ?? [],
    };
  }

  private mapWorkflowStep(entity: OnboardingWorkflowStep) {
    return {
      id: entity.id,
      workflow_id: entity.workflow_id,
      step_order: entity.step_order,
      name: entity.name,
      description: entity.description,
      step_type: entity.step_type,
      task_type: entity.task_type,
      assigned_role_id: entity.assigned_role_id,
      assigned_user_id: entity.assigned_user_id,
      assigned_department_id: entity.assigned_department_id,
      is_required: entity.is_required,
      due_days: entity.due_days,
      required_document_type_code: entity.required_document_type_code,
      requires_verified_document: entity.requires_verified_document,
      completion_evidence_required: entity.completion_evidence_required,
      requires_employee_acknowledgement:
        entity.requires_employee_acknowledgement,
      metadata: entity.metadata,
      created_at: entity.created_at,
    };
  }

  private async findOnboardingWorkflowOrFail(
    companyId: number,
    workflowId: number,
    manager?: EntityManager,
  ): Promise<OnboardingWorkflow> {
    const repository = this.getOnboardingWorkflowRepository(manager);
    const workflow = await repository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
      relations: {
        steps: true,
      },
      order: {
        steps: {
          step_order: 'ASC',
          id: 'ASC',
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Onboarding workflow not found');
    }

    return workflow;
  }

  private async findOnboardingWorkflowStepOrFail(
    workflowId: number,
    stepId: number,
    manager?: EntityManager,
  ): Promise<OnboardingWorkflowStep> {
    const repository = this.getOnboardingWorkflowStepRepository(manager);
    const step = await repository.findOne({
      where: {
        id: stepId,
        workflow_id: workflowId,
      },
    });

    if (!step) {
      throw new NotFoundException('Onboarding workflow step not found');
    }

    return step;
  }

  private async shiftWorkflowStepLevelsDown(
    workflowId: number,
    fromOrder: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getOnboardingWorkflowStepRepository(manager);
    const candidates = await repository.find({
      where: { workflow_id: workflowId },
      order: { step_order: 'ASC', id: 'ASC' },
    });

    for (const candidate of candidates) {
      if (candidate.step_order > fromOrder) {
        candidate.step_order -= 1;
        await repository.save(candidate);
      }
    }
  }

  private async moveWorkflowStepLevel(
    workflowId: number,
    stepId: number,
    currentOrder: number,
    targetOrder: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (currentOrder === targetOrder) return;

    const repository = this.getOnboardingWorkflowStepRepository(manager);
    const allSteps = await repository.find({
      where: { workflow_id: workflowId },
      order: { step_order: 'ASC', id: 'ASC' },
    });

    if (targetOrder > currentOrder) {
      const range = allSteps
        .filter(
          (step) =>
            step.id !== stepId &&
            step.step_order > currentOrder &&
            step.step_order <= targetOrder,
        )
        .sort((l, r) => l.step_order - r.step_order);

      for (const candidate of range) {
        candidate.step_order -= 1;
        await repository.save(candidate);
      }
      return;
    }

    const range = allSteps
      .filter(
        (step) =>
          step.id !== stepId &&
          step.step_order >= targetOrder &&
          step.step_order < currentOrder,
      )
      .sort((l, r) => r.step_order - l.step_order);

    for (const candidate of range) {
      candidate.step_order += 1;
      await repository.save(candidate);
    }
  }

  private buildStepValidationPayload(
    existingStep: OnboardingWorkflowStep,
    dto: UpdateOnboardingWorkflowStepDto,
  ): OnboardingWorkflowStepInputDto {
    return {
      name: dto.name ?? existingStep.name,
      description: dto.description ?? existingStep.description ?? undefined,
      step_type: dto.step_type ?? existingStep.step_type,
      task_type: dto.task_type ?? existingStep.task_type,
      assigned_role_id:
        dto.assigned_role_id ?? existingStep.assigned_role_id ?? undefined,
      assigned_user_id:
        dto.assigned_user_id ?? existingStep.assigned_user_id ?? undefined,
      assigned_department_id:
        dto.assigned_department_id ??
        existingStep.assigned_department_id ??
        undefined,
      is_required: dto.is_required ?? existingStep.is_required,
      due_days: dto.due_days ?? existingStep.due_days ?? undefined,
      required_document_type_code:
        dto.required_document_type_code ??
        existingStep.required_document_type_code ??
        undefined,
      requires_verified_document:
        dto.requires_verified_document ??
        existingStep.requires_verified_document,
      completion_evidence_required:
        dto.completion_evidence_required ??
        existingStep.completion_evidence_required,
      requires_employee_acknowledgement:
        dto.requires_employee_acknowledgement ??
        existingStep.requires_employee_acknowledgement,
      metadata: dto.metadata ?? existingStep.metadata ?? undefined,
    };
  }

  private mapTask(entity: OnboardingTask) {
    return {
      id: entity.id,
      onboarding_request_id: entity.onboarding_request_id,
      workflow_step_id: entity.workflow_step_id,
      task_no: entity.task_no,
      title: entity.title,
      description: entity.description,
      task_type: entity.task_type,
      status: entity.status,
      is_required: entity.is_required,
      assigned_department_id: entity.assigned_department_id,
      assigned_company_user_id: entity.assigned_company_user_id,
      required_document_type_code: entity.required_document_type_code,
      requires_verified_document: entity.requires_verified_document,
      completion_evidence_required: entity.completion_evidence_required,
      evidence_document_id: entity.evidence_document_id,
      completion_data: entity.completion_data,
      due_date: entity.due_date,
      started_at: entity.started_at,
      completed_at: entity.completed_at,
      cancelled_at: entity.cancelled_at,
      completion_notes: entity.completion_notes,
      last_reminder_at: entity.last_reminder_at,
      reminder_count: entity.reminder_count,
      last_escalated_at: entity.last_escalated_at,
      escalation_count: entity.escalation_count,
      version: entity.version,
    };
  }

  private mapApproval(entity: OnboardingApproval) {
    return {
      id: entity.id,
      onboarding_request_id: entity.onboarding_request_id,
      workflow_step_id: entity.workflow_step_id,
      approval_level: entity.approval_level,
      approver_company_user_id: entity.approver_company_user_id,
      original_approver_company_user_id:
        entity.original_approver_company_user_id,
      delegated_from_company_user_id: entity.delegated_from_company_user_id,
      status: entity.status,
      comments: entity.comments,
      signature_url: entity.signature_url,
      acted_at: entity.acted_at,
      delegated_at: entity.delegated_at,
      delegation_reason: entity.delegation_reason,
      due_at: entity.due_at,
      last_reminder_at: entity.last_reminder_at,
      reminder_count: entity.reminder_count,
      last_escalated_at: entity.last_escalated_at,
      escalation_count: entity.escalation_count,
      version: entity.version,
      approver: entity.approver?.user
        ? {
            id: entity.approver.user.id,
            first_name: entity.approver.user.first_name,
            last_name: entity.approver.user.last_name,
            email: entity.approver.user.email,
          }
        : null,
      workflow_step: entity.workflow_step
        ? {
            id: entity.workflow_step.id,
            name: entity.workflow_step.name,
            step_type: entity.workflow_step.step_type,
          }
        : null,
    };
  }

  private mapDocument(entity: Document) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      entity_type: entity.entity_type,
      entity_id: entity.entity_id,
      module: entity.module,
      document_type: entity.document_type,
      title: entity.title,
      description: entity.description,
      file_name: entity.file_name,
      original_file_name: entity.original_file_name,
      mime_type: entity.mime_type,
      file_extension: entity.file_extension,
      file_size: entity.file_size,
      file_path:
        `/api/onboarding/requests/${entity.entity_id}` +
        `/documents/${entity.id}/download`,
      is_verified: entity.is_verified,
      verified_at: entity.verified_at,
      verified_by_company_user_id: entity.verified_by_company_user_id,
      uploaded_by_company_user_id: entity.uploaded_by_company_user_id,
      expiry_date: entity.expiry_date,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }

  private reviewDisplayValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    return JSON.stringify(value);
  }

  private reviewList(values: string[]): string {
    return values.filter((value) => value.trim()).join('; ') || '-';
  }

  private resolveEmployeeReviewDocumentSection(
    documentType: string | null | undefined,
    metadata?: Record<string, unknown> | null,
  ): (typeof EMPLOYEE_DETAIL_SECTIONS)[number][0] | null {
    const explicitSection =
      typeof metadata?.onboarding_section === 'string'
        ? metadata.onboarding_section.trim().toLowerCase()
        : '';
    if (EMPLOYEE_DETAIL_SECTIONS.some(([key]) => key === explicitSection)) {
      return explicitSection as (typeof EMPLOYEE_DETAIL_SECTIONS)[number][0];
    }

    const normalizedType = (documentType ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (
      ['id', 'identity', 'identity_document', 'passport'].includes(
        normalizedType,
      )
    ) {
      return 'identification';
    }
    if (
      [
        'certificate',
        'academic_certificate',
        'professional_certificate',
      ].includes(normalizedType)
    ) {
      return 'education';
    }
    if (['cv', 'curriculum_vitae', 'resume'].includes(normalizedType)) {
      return 'experience';
    }
    if (
      ['offer_letter', 'contract', 'employment_contract'].includes(
        normalizedType,
      )
    ) {
      return 'assignment';
    }
    if (['bank_document', 'bank_statement'].includes(normalizedType)) {
      return 'banking';
    }
    return null;
  }

  private buildEmployeeDetailReview(
    entity: OnboardingRequest,
    onboardingDocuments: Document[] = [],
  ) {
    const employee = entity.employee;
    const metadata = recordValue(entity.metadata);
    const review = recordValue(metadata.employee_details_review);
    const decisions = recordValue(review.sections);
    const field = (label: string, value: unknown) => ({
      label,
      value: this.reviewDisplayValue(value),
    });
    const attachmentsBySection: Record<
      (typeof EMPLOYEE_DETAIL_SECTIONS)[number][0],
      Array<Record<string, unknown>>
    > = {
      personal: [],
      assignment: [],
      contacts: [],
      family: [],
      identification: [],
      banking: [],
      education: [],
      experience: [],
    };

    onboardingDocuments.forEach((document) => {
      const section = this.resolveEmployeeReviewDocumentSection(
        document.document_type,
      );
      if (!section) return;
      attachmentsBySection[section].push({
        id: document.id,
        source: 'onboarding',
        title: document.title,
        original_file_name: document.original_file_name,
        mime_type: document.mime_type,
        file_size: document.file_size,
        document_type: document.document_type,
        download_url: `/api/onboarding/requests/${entity.id}/documents/${document.id}/download`,
      });
    });

    employee?.documents?.forEach((document) => {
      const metadata = recordValue(document.metadata);
      if (metadata.archived === true) return;
      if (document.retention_until && document.retention_until <= new Date()) {
        return;
      }
      const section = this.resolveEmployeeReviewDocumentSection(
        document.type,
        metadata,
      );
      if (!section) return;
      attachmentsBySection[section].push({
        id: document.id,
        source: 'employee_profile',
        title: document.title,
        original_file_name: document.original_file_name,
        mime_type: document.mime_type,
        file_size: document.file_size,
        document_type: document.type,
        download_url: `/api/employees/${employee.id}/documents/${document.id}/download`,
      });
    });
    const fieldsBySection: Record<
      (typeof EMPLOYEE_DETAIL_SECTIONS)[number][0],
      Array<{ label: string; value: string }>
    > = {
      personal: [
        field('First name', employee?.first_name),
        field('Middle name', employee?.middle_name),
        field('Last name', employee?.last_name),
        field('Preferred name', employee?.preferred_name),
        field('Gender', employee?.gender),
        field('Date of birth', employee?.date_of_birth),
        field('Marital status', employee?.marital_status),
        field('Nationality', employee?.nationality),
      ],
      assignment: [
        field('Employee number', employee?.employee_no),
        field('Branch', employee?.primary_branch?.name),
        field('Department', employee?.primary_department?.name),
        field('Position', employee?.primary_position?.name),
        field('Employment type', employee?.employment_type),
        field('Hire date', employee?.hire_date),
        field(
          'Reports to',
          employee?.manager
            ? `${employee.manager.first_name} ${employee.manager.last_name}`.trim()
            : null,
        ),
      ],
      contacts: [
        field(
          'Contacts',
          this.reviewList(
            employee?.contacts?.map((contact) =>
              [
                contact.contact_type,
                contact.email,
                contact.phone_number,
                contact.is_primary ? 'primary' : '',
              ]
                .filter(Boolean)
                .join(' · '),
            ) ?? [],
          ),
        ),
        field(
          'Addresses',
          this.reviewList(
            employee?.addresses?.map((address) =>
              [
                address.address_type,
                address.address_line_1,
                address.address_line_2,
                address.city,
                address.state,
                address.country,
                address.postal_code,
              ]
                .filter(Boolean)
                .join(', '),
            ) ?? [],
          ),
        ),
      ],
      family: [
        field(
          'Relatives and emergency contacts',
          this.reviewList(
            employee?.relatives?.map((relative) =>
              [
                relative.full_name,
                relative.relationship,
                relative.phone,
                relative.email,
                relative.is_emergency_contact ? 'emergency contact' : '',
              ]
                .filter(Boolean)
                .join(' · '),
            ) ?? [],
          ),
        ),
      ],
      identification: [
        field(
          'Identification documents',
          this.reviewList(
            employee?.identifications?.map((identification) =>
              [
                identification.identification_type,
                identification.identification_number,
                identification.issued_country,
                identification.expiry_date
                  ? `expires ${identification.expiry_date}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · '),
            ) ?? [],
          ),
        ),
      ],
      banking: [
        field(
          'Bank and mobile money accounts',
          this.reviewList(
            employee?.bank_accounts?.map((account) =>
              [
                account.bank_name ?? account.mobile_money_provider,
                account.account_name,
                account.account_number,
                account.branch_name,
                account.account_currency,
              ]
                .filter(Boolean)
                .join(' · '),
            ) ?? [],
          ),
        ),
      ],
      education: [
        field(
          'Academic qualifications',
          this.reviewList(
            employee?.academic_qualifications?.map((qualification) =>
              [
                qualification.education_level,
                qualification.degree_or_certificate,
                qualification.field_of_study,
                qualification.institution_name,
              ]
                .filter(Boolean)
                .join(' · '),
            ) ?? [],
          ),
        ),
        field(
          'Professional qualifications',
          this.reviewList(
            employee?.professional_qualifications?.map((qualification) =>
              [
                qualification.programme_name,
                qualification.issuing_organization,
                qualification.institution_name,
                qualification.issue_date,
              ]
                .filter(Boolean)
                .join(' · '),
            ) ?? [],
          ),
        ),
      ],
      experience: [
        field(
          'Previous employment',
          this.reviewList(
            employee?.experience_details?.map((experience) =>
              [
                experience.company_name,
                experience.job_title,
                experience.start_date,
                experience.currently_working ? 'current' : experience.end_date,
                experience.responsibilities_description,
              ]
                .filter(Boolean)
                .join(' · '),
            ) ?? [],
          ),
        ),
      ],
    };

    return {
      status:
        typeof review.status === 'string' ? review.status : 'not_submitted',
      submitted_at:
        typeof review.submitted_at === 'string' ? review.submitted_at : null,
      reviewed_at:
        typeof review.reviewed_at === 'string' ? review.reviewed_at : null,
      workflow_started_before_approval:
        recordValue(metadata.workflow_start).incomplete_details_override ===
        true,
      sections: EMPLOYEE_DETAIL_SECTIONS.map(([key, label]) => {
        const decision = recordValue(decisions[key]);
        return {
          key,
          label,
          status:
            typeof decision.status === 'string' ? decision.status : 'pending',
          comment:
            typeof decision.comment === 'string' ? decision.comment : null,
          reviewed_at:
            typeof decision.reviewed_at === 'string'
              ? decision.reviewed_at
              : null,
          fields: fieldsBySection[key],
          attachments: attachmentsBySection[key],
        };
      }),
    };
  }

  private mapRequest(entity: OnboardingRequest, documents: Document[] = []) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      employee_id: entity.employee_id,
      workflow_id: entity.workflow_id,
      workflow_version: entity.workflow_version,
      onboarding_no: entity.onboarding_no,
      title: entity.title,
      description: entity.description,
      planned_start_date: entity.planned_start_date,
      planned_completion_date: entity.planned_completion_date,
      current_approval_level: entity.current_approval_level,
      status: entity.status,
      progress_percentage: entity.progress_percentage,
      rejection_reason: entity.rejection_reason,
      submitted_at: entity.submitted_at,
      started_at: entity.started_at,
      completed_at: entity.completed_at,
      cancelled_at: entity.cancelled_at,
      created_by_company_user_id: entity.created_by_company_user_id,
      finalized_by_company_user_id: entity.finalized_by_company_user_id,
      workflow_snapshot: entity.workflow_snapshot,
      readiness_snapshot: entity.readiness_snapshot,
      readiness_checked_at: entity.readiness_checked_at,
      employee_acknowledged_at: entity.employee_acknowledged_at,
      employee_acknowledged_by_user_id: entity.employee_acknowledged_by_user_id,
      employee_acknowledgement_version: entity.employee_acknowledgement_version,
      employee_acknowledgement_ip: entity.employee_acknowledgement_ip,
      activation_requested_at: entity.activation_requested_at,
      activation_started_at: entity.activation_started_at,
      activation_failed_at: entity.activation_failed_at,
      activation_failure_reason: entity.activation_failure_reason,
      activation_attempt_count: entity.activation_attempt_count,
      activation_worker_id: entity.activation_worker_id,
      metadata: entity.metadata,
      provisioning: this.readProvisioningMetadata(entity),
      employee_details_review: this.buildEmployeeDetailReview(
        entity,
        documents,
      ),
      version: entity.version,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      employee: entity.employee
        ? {
            id: entity.employee.id,
            employee_no: entity.employee.employee_no,
            first_name: entity.employee.first_name,
            last_name: entity.employee.last_name,
            employment_status: entity.employee.employment_status,
            primary_department: entity.employee.primary_department
              ? {
                  id: entity.employee.primary_department.id,
                  name: entity.employee.primary_department.name,
                }
              : null,
            position: entity.employee.primary_position
              ? {
                  id: entity.employee.primary_position.id,
                  name: entity.employee.primary_position.name,
                }
              : null,
          }
        : null,
      employee_documents:
        entity.employee?.documents?.map((document) => ({
          id: document.id,
          employee_id: document.employee_id,
          source: 'employee_profile',
          type: document.type,
          title: document.title,
          original_file_name: document.original_file_name,
          mime_type: document.mime_type,
          file_size: document.file_size,
          classification: document.classification,
          notes: document.notes,
          metadata: document.metadata,
          retention_until: document.retention_until,
          uploaded_at: document.uploaded_at,
          download_url: `/api/employees/${document.employee_id}/documents/${document.id}/download`,
        })) ?? [],
      workflow: entity.workflow
        ? {
            id: entity.workflow.id,
            name: entity.workflow.name,
            status: entity.workflow.status,
          }
        : null,
      tasks: entity.tasks?.map((task) => this.mapTask(task)) ?? [],
      approvals:
        entity.approvals?.map((approval) => this.mapApproval(approval)) ?? [],
      documents: documents.map((document) => this.mapDocument(document)),
    };
  }

  private async calculateProgressSummary(
    onboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<ProgressSummary> {
    const taskRepository = this.getOnboardingTaskRepository(manager);
    const approvalRepository = this.getOnboardingApprovalRepository(manager);

    const tasks = await taskRepository.find({
      where: { onboarding_request_id: onboardingRequestId },
    });
    const approvals = await approvalRepository.find({
      where: { onboarding_request_id: onboardingRequestId },
    });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
      (task) => task.status === OnboardingTaskStatusEnum.COMPLETED,
    ).length;

    const actionableApprovals = approvals.filter(
      (approval) => approval.status !== OnboardingApprovalStatusEnum.SKIPPED,
    );
    const totalApprovals = actionableApprovals.length;
    const approvedApprovals = actionableApprovals.filter(
      (approval) => approval.status === OnboardingApprovalStatusEnum.APPROVED,
    ).length;

    const totalUnits = totalTasks + totalApprovals;
    const completedUnits = completedTasks + approvedApprovals;
    const progress = totalUnits ? (completedUnits / totalUnits) * 100 : 0;

    return {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      total_approvals: totalApprovals,
      approved_approvals: approvedApprovals,
      progress_percentage: progress.toFixed(2),
    };
  }

  private async updateRequestProgress(
    onboardingRequest: OnboardingRequest,
    manager?: EntityManager,
  ): Promise<ProgressSummary> {
    if (onboardingRequest.status === OnboardingRequestStatusEnum.COMPLETED) {
      onboardingRequest.progress_percentage = '100.00';
      await this.getOnboardingRequestRepository(manager).save(
        onboardingRequest,
      );
      return {
        total_tasks: 0,
        completed_tasks: 0,
        total_approvals: 0,
        approved_approvals: 0,
        progress_percentage: onboardingRequest.progress_percentage,
      };
    }

    const summary = await this.calculateProgressSummary(
      onboardingRequest.id,
      manager,
    );
    onboardingRequest.progress_percentage = summary.progress_percentage;
    await this.getOnboardingRequestRepository(manager).save(onboardingRequest);
    return summary;
  }

  private async loadOnboardingDocuments(
    companyId: number,
    onboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<Document[]> {
    return this.getDocumentRepository(manager).find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: onboardingRequestId,
      },
      order: { created_at: 'DESC' },
    });
  }

  private async assertCanCompleteTask(
    actor: AuthenticatedUser,
    task: OnboardingTask,
  ): Promise<void> {
    const assignedDepartmentId = task.assigned_department_id;

    if (
      task.assigned_company_user_id &&
      actor.companyMembershipId === task.assigned_company_user_id
    ) {
      return;
    }

    if (
      this.hrAccessService.hasCompanyScope(actor) &&
      hasPermission(actor.permissions, 'onboarding_tasks:complete')
    ) {
      return;
    }

    if (assignedDepartmentId && actor.employeeId) {
      const belongsToDepartment = await this.employeeRepository
        .createQueryBuilder('employee')
        .leftJoin('employee.department_assignments', 'departmentAssignment')
        .where('employee.id = :employeeId', { employeeId: actor.employeeId })
        .andWhere(
          '(employee.primary_department_id = :departmentId OR departmentAssignment.department_id = :departmentId)',
          { departmentId: assignedDepartmentId },
        )
        .getExists();

      if (belongsToDepartment) {
        return;
      }
    }

    if (
      assignedDepartmentId &&
      (await this.hrAccessService
        .getAccessibleDepartmentIds(actor)
        .then((ids) => ids?.includes(assignedDepartmentId) ?? false))
    ) {
      return;
    }

    const assignedRoleId =
      task.assigned_company_user_id || task.assigned_department_id
        ? null
        : (task.workflow_step?.assigned_role_id ?? null);
    if (assignedRoleId && actor.companyMembershipId) {
      const hasAssignedRole = await this.companyUserRoleRepository.exists({
        where: {
          company_user_id: actor.companyMembershipId,
          role_id: assignedRoleId,
        },
      });
      if (hasAssignedRole) {
        return;
      }
    }

    if (
      !task.assigned_company_user_id &&
      !task.assigned_department_id &&
      !assignedRoleId &&
      hasPermission(actor.permissions, 'onboarding_tasks:complete')
    ) {
      return;
    }

    throw new ForbiddenException(
      'You are not allowed to complete this onboarding task',
    );
  }

  private async resolveTaskRecipients(
    companyId: number,
    assignment: {
      assigned_user_id?: number | null;
      assigned_role_id?: number | null;
      assigned_department_id?: number | null;
    },
    manager?: EntityManager,
  ): Promise<CompanyUser[]> {
    const conditions: string[] = [];
    const parameters: Record<string, number> = { companyId };
    const repository =
      manager?.getRepository(CompanyUser) ?? this.companyUserRepository;
    const query = repository
      .createQueryBuilder('companyUser')
      .innerJoinAndSelect('companyUser.user', 'user')
      .where('companyUser.company_id = :companyId', { companyId })
      .andWhere("LOWER(companyUser.status) = 'active'")
      .distinct(true);

    if (assignment.assigned_user_id) {
      conditions.push('companyUser.id = :assignedUserId');
      parameters.assignedUserId = assignment.assigned_user_id;
    } else if (assignment.assigned_department_id) {
      query
        .leftJoin('companyUser.employee', 'employee')
        .leftJoin('employee.department_assignments', 'departmentAssignment');
      conditions.push('employee.primary_department_id = :assignedDepartmentId');
      conditions.push(
        'departmentAssignment.department_id = :assignedDepartmentId',
      );
      parameters.assignedDepartmentId = assignment.assigned_department_id;
    } else if (assignment.assigned_role_id) {
      query.leftJoin('companyUser.role_assignments', 'roleAssignment');
      conditions.push('roleAssignment.role_id = :assignedRoleId');
      parameters.assignedRoleId = assignment.assigned_role_id;
    }

    if (!conditions.length) {
      return [];
    }

    return query.andWhere(`(${conditions.join(' OR ')})`, parameters).getMany();
  }

  private emitTaskAssignedToRecipients(input: {
    recipients: CompanyUser[];
    employeeName: string;
    task: OnboardingTask;
    companyId: number;
    onboardingRequestId: number;
    senderCompanyUserId: number | null;
  }): void {
    const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;
    const taskUrl = `${frontendUrl.replace(/\/$/, '')}/dashboard/me/requests/actions`;

    for (const companyUser of input.recipients) {
      const assignee = companyUser.user;
      const assigneeName =
        `${assignee.first_name ?? ''} ${assignee.last_name ?? ''}`.trim() ||
        assignee.email ||
        'Team member';

      this.eventEmitter.emit(
        OnboardingTaskAssignedEvent.EVENT,
        new OnboardingTaskAssignedEvent(
          assigneeName,
          assignee.email?.trim() ?? '',
          input.employeeName,
          input.task.title,
          input.task.description,
          input.task.due_date,
          taskUrl,
          input.companyId,
          input.onboardingRequestId,
          input.task.id,
          companyUser.id,
          input.senderCompanyUserId,
          input.task.task_no,
        ),
      );
    }
  }

  private async synchronizeDocumentTasks(
    companyId: number,
    onboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const taskRepository = this.getOnboardingTaskRepository(manager);
    const tasks = await taskRepository.find({
      where: {
        onboarding_request_id: onboardingRequestId,
        task_type: OnboardingTaskTypeEnum.DOCUMENT,
      },
    });

    if (!tasks.length) {
      return;
    }

    const documents = await this.loadOnboardingDocuments(
      companyId,
      onboardingRequestId,
      manager,
    );

    for (const task of tasks) {
      const matchingDocuments = documents.filter((document) => {
        if (
          task.required_document_type_code &&
          document.document_type !== task.required_document_type_code
        ) {
          return false;
        }

        if (task.requires_verified_document && !document.is_verified) {
          return false;
        }

        return true;
      });

      const matchedDocument = matchingDocuments[0] ?? null;
      const shouldBeCompleted = Boolean(matchedDocument);

      if (
        shouldBeCompleted &&
        task.status !== OnboardingTaskStatusEnum.COMPLETED
      ) {
        task.status = OnboardingTaskStatusEnum.COMPLETED;
        task.started_at = task.started_at ?? new Date();
        task.completed_at = new Date();
        task.completion_notes =
          task.completion_notes ??
          'Completed automatically from onboarding documents';
        task.evidence_document_id = matchedDocument?.id ?? null;
        await taskRepository.save(task);
        continue;
      }

      if (
        !shouldBeCompleted &&
        task.status === OnboardingTaskStatusEnum.COMPLETED
      ) {
        task.status = OnboardingTaskStatusEnum.PENDING;
        task.completed_at = null;
        task.completed_by_company_user_id = null;
        task.completion_notes = null;
        task.evidence_document_id = null;
        await taskRepository.save(task);
      }
    }
  }

  private async createTasksFromWorkflowSteps(
    onboardingRequest: OnboardingRequest,
    steps: OnboardingWorkflowStep[],
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<void> {
    const taskRepository = this.getOnboardingTaskRepository(manager);
    const employeeName =
      `${onboardingRequest.employee?.first_name ?? ''} ${onboardingRequest.employee?.last_name ?? ''}`.trim();
    for (const step of steps) {
      if (step.step_type === OnboardingStepTypeEnum.SIGN_OFF) {
        continue;
      }

      const dueDate = step.due_days
        ? new Date(Date.now() + step.due_days * 86400000)
        : null;
      const recipients = await this.resolveTaskRecipients(
        onboardingRequest.company_id,
        step,
        manager,
      );
      const checklistItems = this.readWorkflowChecklistItems(step.metadata);
      const taskDefinitions = checklistItems.length
        ? checklistItems.map((item, index) => ({
            title: `${step.name} — ${index + 1}. ${item.name}`,
            description:
              [step.description, item.description]
                .filter((value): value is string => Boolean(value?.trim()))
                .join('\n\n') || null,
          }))
        : [{ title: step.name, description: step.description }];

      for (const taskDefinition of taskDefinitions) {
        const taskNo = await this.generateTaskNo(onboardingRequest.id, manager);
        const savedTask = await taskRepository.save(
          taskRepository.create({
            onboarding_request_id: onboardingRequest.id,
            workflow_step_id: step.id,
            task_no: taskNo,
            title: taskDefinition.title,
            description: taskDefinition.description,
            task_type: this.resolveWorkflowTaskType(
              step.step_type,
              step.task_type,
            ),
            status: OnboardingTaskStatusEnum.PENDING,
            is_required: step.is_required,
            assigned_department_id: step.assigned_department_id ?? null,
            assigned_company_user_id: step.assigned_user_id ?? null,
            required_document_type_code:
              step.required_document_type_code ?? null,
            requires_verified_document: step.requires_verified_document,
            completion_evidence_required: step.completion_evidence_required,
            due_date: dueDate,
            created_by_company_user_id: actor.companyMembershipId ?? null,
          }),
        );

        this.emitTaskAssignedToRecipients({
          recipients,
          employeeName: employeeName || 'Employee',
          task: savedTask,
          companyId: onboardingRequest.company_id,
          onboardingRequestId: onboardingRequest.id,
          senderCompanyUserId:
            onboardingRequest.created_by_company_user_id ?? null,
        });
      }
    }

    await this.synchronizeDocumentTasks(
      onboardingRequest.company_id,
      onboardingRequest.id,
      manager,
    );
  }

  private async findOnboardingRequestOrFail(
    companyId: number,
    onboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<OnboardingRequest> {
    const repository = this.getOnboardingRequestRepository(manager);
    const request = await repository.findOne({
      where: {
        id: onboardingRequestId,
        company_id: companyId,
      },
      relations: {
        employee: {
          company_user: true,
          primary_branch: true,
          primary_department: true,
          primary_position: true,
          manager: true,
          contacts: true,
          addresses: true,
          relatives: true,
          identifications: true,
          bank_accounts: true,
          academic_qualifications: true,
          professional_qualifications: true,
          experience_details: true,
          documents: true,
        },
        workflow: true,
        tasks: true,
        approvals: { approver: { user: true }, workflow_step: true },
      },
    });

    if (!request) {
      throw new NotFoundException('Onboarding request not found');
    }

    return request;
  }

  async createOnboardingWorkflow(
    companyId: number,
    dto: CreateOnboardingWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    await this.validateWorkflowStepReferences(companyId, dto.steps);

    const created = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = this.getOnboardingWorkflowRepository(manager);
      const workflowStepRepository =
        this.getOnboardingWorkflowStepRepository(manager);

      if (dto.is_default) {
        await workflowRepository.update(
          { company_id: companyId, is_default: true },
          { is_default: false },
        );
      }

      const workflow = await workflowRepository.save(
        workflowRepository.create({
          company_id: companyId,
          name: dto.name.trim(),
          description: this.normalizeOptionalString(dto.description),
          version: 1,
          root_workflow_id: null,
          is_default: dto.is_default ?? false,
          is_locked: false,
          locked_at: null,
          created_by_company_user_id: actor.companyMembershipId ?? null,
          status: dto.status ?? OnboardingRecordStatusEnum.ACTIVE,
        }),
      );

      await workflowStepRepository.save(
        dto.steps.map((step, index) =>
          workflowStepRepository.create({
            workflow_id: workflow.id,
            step_order: index + 1,
            name: step.name.trim(),
            description: this.normalizeOptionalString(step.description),
            step_type: step.step_type,
            task_type: this.resolveWorkflowTaskType(
              step.step_type,
              step.task_type,
            ),
            assigned_role_id: step.assigned_role_id ?? null,
            assigned_user_id: step.assigned_user_id ?? null,
            assigned_department_id: step.assigned_department_id ?? null,
            is_required: step.is_required ?? true,
            due_days: step.due_days ?? null,
            required_document_type_code: this.normalizeOptionalString(
              step.required_document_type_code,
            ),
            requires_verified_document:
              step.requires_verified_document ?? false,
            completion_evidence_required:
              step.completion_evidence_required ?? false,
            requires_employee_acknowledgement:
              step.requires_employee_acknowledgement ?? false,
            metadata: step.metadata ?? null,
          }),
        ),
      );

      return workflowRepository.findOneOrFail({
        where: { id: workflow.id },
        relations: { steps: true },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.created',
      entity_name: 'onboarding_workflow',
      entity_id: created.id,
      actor,
    });

    return this.mapWorkflow(created);
  }

  async findAllOnboardingWorkflows(
    companyId: number,
    query: OnboardingWorkflowQueryDto,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
    } = query;

    const qb = this.onboardingWorkflowRepository
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.steps', 'steps')
      .where('workflow.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('workflow.status = :status', { status: status.trim() });
    }

    if (search?.trim()) {
      qb.andWhere(
        '(workflow.name LIKE :term OR workflow.description LIKE :term)',
        {
          term: `%${search.trim()}%`,
        },
      );
    }

    const allowedSortFields = [
      'id',
      'name',
      'status',
      'created_at',
      'updated_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`workflow.${safeSortBy}`, direction)
      .addOrderBy('steps.step_order', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapWorkflow(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneOnboardingWorkflow(companyId: number, workflowId: number) {
    const workflow = await this.onboardingWorkflowRepository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
      relations: { steps: true },
      order: { steps: { step_order: 'ASC' } },
    });

    if (!workflow) {
      throw new NotFoundException('Onboarding workflow not found');
    }

    return this.mapWorkflow(workflow);
  }

  async updateOnboardingWorkflow(
    companyId: number,
    workflowId: number,
    dto: UpdateOnboardingWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    const updated = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = this.getOnboardingWorkflowRepository(manager);
      const stepRepository = this.getOnboardingWorkflowStepRepository(manager);
      const workflow = await workflowRepository.findOne({
        where: {
          id: workflowId,
          company_id: companyId,
        },
        relations: { steps: true },
      });

      if (!workflow) {
        throw new NotFoundException('Onboarding workflow not found');
      }

      this.assertWorkflowEditable(workflow);

      if (dto.steps) {
        await this.validateWorkflowStepReferences(
          companyId,
          dto.steps,
          manager,
        );
      }

      if (dto.name !== undefined) {
        workflow.name = dto.name.trim();
      }
      if (dto.description !== undefined) {
        workflow.description = this.normalizeOptionalString(dto.description);
      }
      if (dto.status !== undefined) {
        workflow.status = dto.status;
      }

      if (dto.is_default !== undefined) {
        workflow.is_default = dto.is_default;
        if (dto.is_default) {
          await workflowRepository.update(
            { company_id: companyId, is_default: true },
            { is_default: false },
          );
          workflow.is_default = true;
        }
      }

      await workflowRepository.save(workflow);

      if (dto.steps) {
        await stepRepository.delete({ workflow_id: workflow.id });
        await stepRepository.save(
          dto.steps.map((step, index) =>
            stepRepository.create({
              workflow_id: workflow.id,
              step_order: index + 1,
              name: step.name.trim(),
              description: this.normalizeOptionalString(step.description),
              step_type: step.step_type,
              task_type: this.resolveWorkflowTaskType(
                step.step_type,
                step.task_type,
              ),
              assigned_role_id: step.assigned_role_id ?? null,
              assigned_user_id: step.assigned_user_id ?? null,
              assigned_department_id: step.assigned_department_id ?? null,
              is_required: step.is_required ?? true,
              due_days: step.due_days ?? null,
              required_document_type_code: this.normalizeOptionalString(
                step.required_document_type_code,
              ),
              requires_verified_document:
                step.requires_verified_document ?? false,
              completion_evidence_required:
                step.completion_evidence_required ?? false,
              requires_employee_acknowledgement:
                step.requires_employee_acknowledgement ?? false,
              metadata: step.metadata ?? null,
            }),
          ),
        );
      }

      return workflowRepository.findOneOrFail({
        where: { id: workflow.id },
        relations: { steps: true },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.updated',
      entity_name: 'onboarding_workflow',
      entity_id: updated.id,
      actor,
    });

    return this.mapWorkflow(updated);
  }

  async createOnboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    dto: CreateOnboardingWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    await this.validateWorkflowStepReferences(companyId, [dto]);

    const createdStep = await this.dataSource.transaction(async (manager) => {
      const workflow = await this.findOnboardingWorkflowOrFail(
        companyId,
        workflowId,
        manager,
      );
      this.assertWorkflowEditable(workflow);
      const repository = this.getOnboardingWorkflowStepRepository(manager);

      const targetOrder = workflow.steps.length + 1;

      return repository.save(
        repository.create({
          workflow_id: workflowId,
          step_order: targetOrder,
          name: dto.name.trim(),
          description: this.normalizeOptionalString(dto.description),
          step_type: dto.step_type,
          task_type: this.resolveWorkflowTaskType(dto.step_type, dto.task_type),
          assigned_role_id: dto.assigned_role_id ?? null,
          assigned_user_id: dto.assigned_user_id ?? null,
          assigned_department_id: dto.assigned_department_id ?? null,
          is_required: dto.is_required ?? true,
          due_days: dto.due_days ?? null,
          required_document_type_code: this.normalizeOptionalString(
            dto.required_document_type_code,
          ),
          requires_verified_document: dto.requires_verified_document ?? false,
          completion_evidence_required:
            dto.completion_evidence_required ?? false,
          requires_employee_acknowledgement:
            dto.requires_employee_acknowledgement ?? false,
          metadata: dto.metadata ?? null,
        }),
      );
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.step_created',
      entity_name: 'onboarding_workflow_step',
      entity_id: createdStep.id,
      actor,
      payload: {
        workflow_id: workflowId,
        step_order: createdStep.step_order,
      },
    });

    return this.mapWorkflowStep(createdStep);
  }

  async updateOnboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    dto: UpdateOnboardingWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const updatedStep = await this.dataSource.transaction(async (manager) => {
      const workflow = await this.findOnboardingWorkflowOrFail(
        companyId,
        workflowId,
        manager,
      );
      this.assertWorkflowEditable(workflow);
      const existingStep = await this.findOnboardingWorkflowStepOrFail(
        workflowId,
        stepId,
        manager,
      );

      const validationPayload = this.buildStepValidationPayload(
        existingStep,
        dto,
      );
      await this.validateWorkflowStepReferences(
        companyId,
        [validationPayload],
        manager,
      );

      const totalSteps = workflow.steps.length;
      const targetOrder = dto.step_order ?? existingStep.step_order;
      if (targetOrder < 1 || targetOrder > totalSteps) {
        throw new BadRequestException(
          `step_order must be between 1 and ${totalSteps} for this workflow`,
        );
      }

      await this.moveWorkflowStepLevel(
        workflowId,
        stepId,
        existingStep.step_order,
        targetOrder,
        manager,
      );

      existingStep.step_order = targetOrder;
      if (dto.name !== undefined) {
        existingStep.name = dto.name.trim();
      }
      if (dto.description !== undefined) {
        existingStep.description = this.normalizeOptionalString(
          dto.description,
        );
      }
      if (dto.step_type !== undefined) {
        existingStep.step_type = dto.step_type;
        existingStep.task_type = this.resolveWorkflowTaskType(
          dto.step_type,
          dto.task_type ?? existingStep.task_type,
        );
      }
      if (dto.task_type !== undefined && dto.step_type === undefined) {
        existingStep.task_type = this.resolveWorkflowTaskType(
          existingStep.step_type,
          dto.task_type,
        );
      }
      if (dto.assigned_role_id !== undefined) {
        existingStep.assigned_role_id = dto.assigned_role_id ?? null;
      }
      if (dto.assigned_user_id !== undefined) {
        existingStep.assigned_user_id = dto.assigned_user_id ?? null;
      }
      if (dto.assigned_department_id !== undefined) {
        existingStep.assigned_department_id =
          dto.assigned_department_id ?? null;
      }
      if (dto.is_required !== undefined) {
        existingStep.is_required = dto.is_required;
      }
      if (dto.due_days !== undefined) {
        existingStep.due_days = dto.due_days ?? null;
      }
      if (dto.required_document_type_code !== undefined) {
        existingStep.required_document_type_code = this.normalizeOptionalString(
          dto.required_document_type_code,
        );
      }
      if (dto.requires_verified_document !== undefined) {
        existingStep.requires_verified_document =
          dto.requires_verified_document;
      }
      if (dto.completion_evidence_required !== undefined) {
        existingStep.completion_evidence_required =
          dto.completion_evidence_required;
      }
      if (dto.requires_employee_acknowledgement !== undefined) {
        existingStep.requires_employee_acknowledgement =
          dto.requires_employee_acknowledgement;
      }
      if (dto.metadata !== undefined) {
        existingStep.metadata = dto.metadata ?? null;
      }

      return this.getOnboardingWorkflowStepRepository(manager).save(
        existingStep,
      );
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.step_updated',
      entity_name: 'onboarding_workflow_step',
      entity_id: updatedStep.id,
      actor,
      payload: {
        workflow_id: workflowId,
        step_order: updatedStep.step_order,
      },
    });

    return this.mapWorkflowStep(updatedStep);
  }

  async removeOnboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const deletedPayload = await this.dataSource.transaction(
      async (manager) => {
        const workflow = await this.findOnboardingWorkflowOrFail(
          companyId,
          workflowId,
          manager,
        );
        this.assertWorkflowEditable(workflow);
        if (workflow.steps.length <= 1) {
          throw new BadRequestException(
            'Workflow must contain at least one step',
          );
        }

        const step = await this.findOnboardingWorkflowStepOrFail(
          workflowId,
          stepId,
          manager,
        );
        const deletedLevel = step.step_order;

        await this.getOnboardingWorkflowStepRepository(manager).delete({
          id: step.id,
        });
        await this.shiftWorkflowStepLevelsDown(
          workflowId,
          deletedLevel,
          manager,
        );

        return {
          stepId: step.id,
          deletedLevel,
        };
      },
    );

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.step_deleted',
      entity_name: 'onboarding_workflow_step',
      entity_id: deletedPayload.stepId,
      actor,
      payload: {
        workflow_id: workflowId,
        deleted_level: deletedPayload.deletedLevel,
      },
    });

    return { message: 'Onboarding workflow step deleted successfully' };
  }

  async removeOnboardingWorkflow(
    companyId: number,
    workflowId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const workflow = await this.onboardingWorkflowRepository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
    });
    if (!workflow) {
      throw new NotFoundException('Onboarding workflow not found');
    }

    this.assertWorkflowEditable(workflow);

    workflow.status = OnboardingRecordStatusEnum.INACTIVE;
    workflow.is_default = false;
    await this.onboardingWorkflowRepository.save(workflow);

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.deactivated',
      entity_name: 'onboarding_workflow',
      entity_id: workflow.id,
      actor,
    });

    return { message: 'Onboarding workflow deactivated successfully' };
  }

  async cloneOnboardingWorkflow(
    companyId: number,
    workflowId: number,
    dto: CloneOnboardingWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const cloned = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = this.getOnboardingWorkflowRepository(manager);
      const stepRepository = this.getOnboardingWorkflowStepRepository(manager);
      const source = await this.findOnboardingWorkflowOrFail(
        companyId,
        workflowId,
        manager,
      );

      const rootWorkflowId = source.root_workflow_id ?? source.id;
      const familyVersions = await workflowRepository.find({
        where: [
          { company_id: companyId, id: rootWorkflowId },
          { company_id: companyId, root_workflow_id: rootWorkflowId },
        ],
        select: ['version'],
      });
      const nextVersion =
        Math.max(
          source.version,
          ...familyVersions.map((item) => item.version),
        ) + 1;

      if (dto.is_default) {
        await workflowRepository.update(
          { company_id: companyId, is_default: true },
          { is_default: false },
        );
      }

      const clone = await workflowRepository.save(
        workflowRepository.create({
          company_id: companyId,
          name:
            this.normalizeOptionalString(dto.name) ??
            `${source.name} v${nextVersion}`,
          description: source.description,
          version: nextVersion,
          root_workflow_id: rootWorkflowId,
          is_default: dto.is_default ?? false,
          is_locked: false,
          locked_at: null,
          created_by_company_user_id: actor.companyMembershipId ?? null,
          status: OnboardingRecordStatusEnum.ACTIVE,
        }),
      );

      await stepRepository.save(
        source.steps.map((step) =>
          stepRepository.create({
            workflow_id: clone.id,
            step_order: step.step_order,
            name: step.name,
            description: step.description,
            step_type: step.step_type,
            task_type: step.task_type,
            assigned_role_id: step.assigned_role_id,
            assigned_user_id: step.assigned_user_id,
            assigned_department_id: step.assigned_department_id,
            is_required: step.is_required,
            due_days: step.due_days,
            required_document_type_code: step.required_document_type_code,
            requires_verified_document: step.requires_verified_document,
            completion_evidence_required: step.completion_evidence_required,
            requires_employee_acknowledgement:
              step.requires_employee_acknowledgement,
            metadata: step.metadata,
          }),
        ),
      );

      return workflowRepository.findOneOrFail({
        where: { id: clone.id },
        relations: { steps: true },
        order: { steps: { step_order: 'ASC', id: 'ASC' } },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.cloned',
      entity_name: 'onboarding_workflow',
      entity_id: cloned.id,
      actor,
      payload: {
        source_workflow_id: workflowId,
        version: cloned.version,
      },
    });

    return this.mapWorkflow(cloned);
  }

  async startOnboardingForEmployee(
    companyId: number,
    dto: CreateOnboardingRequestDto,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<OnboardingCreationResult> {
    const employee = await this.findEmployeeOrFail(
      companyId,
      dto.employee_id,
      manager,
    );

    await this.ensureNoActiveOnboarding(companyId, dto.employee_id, manager);

    if (employee.employment_status === EmploymentStatusEnum.ACTIVE) {
      throw new ConflictException(
        'Cannot create onboarding for an active employee',
      );
    }

    if (dto.planned_start_date && dto.planned_completion_date) {
      this.assertDateOrder(
        dto.planned_start_date,
        dto.planned_completion_date,
        'planned_completion_date cannot be before planned_start_date',
      );
    }

    const run = async (transactionManager: EntityManager) => {
      const requestRepository =
        this.getOnboardingRequestRepository(transactionManager);
      const workflow = await this.findOnboardingWorkflowOrFail(
        companyId,
        (
          await this.onboardingWorkflowService.resolveWorkflow(
            companyId,
            dto.workflow_id ?? null,
            transactionManager,
          )
        ).id,
        transactionManager,
      );
      const onboardingNo = await this.generateOnboardingNo(
        companyId,
        transactionManager,
      );

      // Resolve every step before writing approvals; drafts never need approvers.
      const approvers =
        (dto.submit ?? true)
          ? await this.onboardingWorkflowService.prepareApprovers(
              companyId,
              workflow.steps,
              transactionManager,
            )
          : null;
      const failures = approvers?.failures ?? [];
      const shouldSubmit =
        !!approvers &&
        !failures.length &&
        approvers.assignments.some(({ membershipIds }) => membershipIds.length);
      const warning = failures.length
        ? `Required workflow step at order ${failures[0].step_order} has no eligible approver. Onboarding saved as draft.`
        : approvers && !shouldSubmit
          ? 'Workflow has no eligible approvers. Onboarding saved as draft.'
          : null;

      const created = await requestRepository.save(
        requestRepository.create({
          company_id: companyId,
          employee_id: dto.employee_id,
          workflow_id: workflow.id,
          workflow_version: workflow.version,
          onboarding_no: onboardingNo,
          title:
            this.normalizeOptionalString(dto.title) ??
            this.buildDefaultOnboardingTitle(employee),
          description: this.normalizeOptionalString(dto.description),
          planned_start_date: dto.planned_start_date ?? null,
          planned_completion_date: dto.planned_completion_date ?? null,
          current_approval_level: 0,
          status: shouldSubmit
            ? OnboardingRequestStatusEnum.SUBMITTED
            : OnboardingRequestStatusEnum.DRAFT,
          progress_percentage: '0.00',
          submitted_at: shouldSubmit ? new Date() : null,
          started_at: shouldSubmit ? new Date() : null,
          created_by_company_user_id: actor.companyMembershipId!,
          workflow_snapshot: this.buildWorkflowSnapshot(workflow),
          metadata: this.withProvisioningMetadata(null, dto.provisioning),
        }),
      );

      await this.lockWorkflowIfNeeded(workflow, transactionManager);

      if (shouldSubmit) {
        const init =
          await this.onboardingWorkflowService.initializeApprovalsForRequest(
            companyId,
            created,
            workflow.id,
            transactionManager,
            approvers,
          );
        await this.createTasksFromWorkflowSteps(
          created,
          init.steps,
          actor,
          transactionManager,
        );
        created.status = OnboardingRequestStatusEnum.SUBMITTED;
      }

      await this.updateRequestProgress(created, transactionManager);

      await this.onboardingAuditService.log(
        {
          company_id: companyId,
          onboarding_request_id: created.id,
          action: 'onboarding_request.created',
          entity_name: 'onboarding_request',
          entity_id: created.id,
          actor,
          payload: {
            onboarding_no: created.onboarding_no,
            status: created.status,
          },
        },
        transactionManager,
      );

      const request = await requestRepository.findOneOrFail({
        where: { id: created.id },
        relations: {
          employee: {
            company_user: true,
            primary_department: true,
            primary_position: true,
          },
          workflow: true,
          tasks: true,
          approvals: { approver: { user: true }, workflow_step: true },
        },
      });
      return Object.assign(request, { warning, warning_details: failures });
    };

    if (manager) {
      return run(manager);
    }

    return this.dataSource.transaction(run);
  }

  async createOnboardingRequest(
    companyId: number,
    dto: CreateOnboardingRequestDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    const request = await this.startOnboardingForEmployee(
      companyId,
      dto,
      actor,
    );

    if (request.submitted_at) {
      this.emitOnboardingSubmitted(companyId, request, actor).catch(() => {});
    }

    return {
      ...this.mapRequest(request),
      warning: request.warning,
      warning_details: request.warning_details,
    };
  }

  async updateOnboardingRequest(
    companyId: number,
    onboardingRequestId: number,
    dto: UpdateOnboardingRequestDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OnboardingRequestStatusEnum.CANCELLED ||
      request.status === OnboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        'Cannot update a closed onboarding request',
      );
    }

    if (dto.planned_start_date && dto.planned_completion_date) {
      this.assertDateOrder(
        dto.planned_start_date,
        dto.planned_completion_date,
        'planned_completion_date cannot be before planned_start_date',
      );
    }

    let workflowRestarted = false;
    let previousWorkflowId: number | null = null;
    const updated = await this.dataSource.transaction(async (manager) => {
      const repository = this.getOnboardingRequestRepository(manager);
      const taskRepository = this.getOnboardingTaskRepository(manager);
      const approvalRepository = this.getOnboardingApprovalRepository(manager);

      const current = await repository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });

      if (dto.title !== undefined) {
        current.title = dto.title.trim();
      }
      if (dto.description !== undefined) {
        current.description = this.normalizeOptionalString(dto.description);
      }
      if (dto.planned_start_date !== undefined) {
        current.planned_start_date = dto.planned_start_date ?? null;
      }
      if (dto.planned_completion_date !== undefined) {
        current.planned_completion_date = dto.planned_completion_date ?? null;
      }
      if (dto.provisioning !== undefined) {
        current.metadata = this.withProvisioningMetadata(
          current.metadata,
          dto.provisioning,
        );
      }

      const workflowChanged =
        dto.workflow_id !== undefined &&
        dto.workflow_id !== current.workflow_id;
      if (workflowChanged) {
        if (
          ![
            OnboardingRequestStatusEnum.DRAFT,
            OnboardingRequestStatusEnum.SUBMITTED,
            OnboardingRequestStatusEnum.IN_REVIEW,
          ].includes(current.status)
        ) {
          throw new ConflictException(
            'The workflow cannot be changed after onboarding work has started',
          );
        }
        const wasStarted = current.status !== OnboardingRequestStatusEnum.DRAFT;
        if (wasStarted) {
          const [existingApprovals, existingTasks] = await Promise.all([
            approvalRepository.find({
              where: { onboarding_request_id: current.id },
            }),
            taskRepository.find({
              where: { onboarding_request_id: current.id },
            }),
          ]);
          const approvalHasProgress = existingApprovals.some(
            (approval) =>
              approval.status === OnboardingApprovalStatusEnum.APPROVED ||
              approval.status === OnboardingApprovalStatusEnum.REJECTED,
          );
          const taskHasProgress = existingTasks.some(
            (task) => task.status !== OnboardingTaskStatusEnum.PENDING,
          );
          if (approvalHasProgress || taskHasProgress) {
            throw new ConflictException(
              'The workflow cannot be changed after an approval or task has been actioned. Reassign a pending approver instead.',
            );
          }
        }
        const workflow = await this.findOnboardingWorkflowOrFail(
          companyId,
          (
            await this.onboardingWorkflowService.resolveWorkflow(
              companyId,
              dto.workflow_id ?? null,
              manager,
            )
          ).id,
          manager,
        );
        const approvers = wasStarted
          ? await this.onboardingWorkflowService.prepareApprovers(
              companyId,
              workflow.steps,
              manager,
            )
          : null;
        if (approvers?.failures.length) {
          throw new BadRequestException(
            `Required workflow step at order ${approvers.failures[0].step_order} has no eligible assignee`,
          );
        }
        if (
          approvers &&
          !approvers.assignments.some(
            ({ membershipIds }) => membershipIds.length,
          )
        ) {
          throw new BadRequestException('Workflow has no eligible assignees');
        }

        previousWorkflowId = current.workflow_id;
        current.workflow_id = workflow.id;
        current.workflow_version = workflow.version;
        current.workflow_snapshot = this.buildWorkflowSnapshot(workflow);
        await approvalRepository.delete({ onboarding_request_id: current.id });
        await taskRepository.delete({ onboarding_request_id: current.id });
        await this.lockWorkflowIfNeeded(workflow, manager);

        if (wasStarted && approvers) {
          current.employee = request.employee;
          const initialized =
            await this.onboardingWorkflowService.initializeApprovalsForRequest(
              companyId,
              current,
              workflow.id,
              manager,
              approvers,
            );
          await this.createTasksFromWorkflowSteps(
            current,
            initialized.steps,
            actor,
            manager,
          );
          current.status = OnboardingRequestStatusEnum.SUBMITTED;
          current.current_approval_level = initialized.initialLevel;
          workflowRestarted = true;
        }
      }

      await repository.save(current);
      await this.updateRequestProgress(current, manager);

      return repository.findOneOrFail({
        where: { id: current.id },
        relations: {
          employee: {
            company_user: true,
            primary_department: true,
            primary_position: true,
          },
          workflow: true,
          tasks: true,
          approvals: { approver: { user: true }, workflow_step: true },
        },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: updated.id,
      action: 'onboarding_request.updated',
      entity_name: 'onboarding_request',
      entity_id: updated.id,
      actor,
      payload: {
        status: updated.status,
        previous_workflow_id: previousWorkflowId,
        workflow_id: updated.workflow_id,
        workflow_restarted: workflowRestarted,
      },
    });

    if (workflowRestarted) {
      this.emitOnboardingSubmitted(companyId, updated, actor).catch(() => {});
    }

    const documents = await this.loadOnboardingDocuments(companyId, updated.id);

    return this.mapRequest(updated, documents);
  }

  async submitEmployeeDetailsForReview(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    if (
      actor.employeeId !== request.employee_id &&
      actor.companyMembershipId !== request.employee.company_user_id
    ) {
      throw new ForbiddenException(
        'Only the employee on this onboarding request can submit these details',
      );
    }
    if (
      [
        OnboardingRequestStatusEnum.CANCELLED,
        OnboardingRequestStatusEnum.COMPLETED,
        OnboardingRequestStatusEnum.ACTIVATING,
      ].includes(request.status)
    ) {
      throw new ConflictException(
        'Employee details cannot be submitted after onboarding is closed',
      );
    }

    const submittedAt = new Date();
    const metadata = { ...(request.metadata ?? {}) };
    const previousReview = recordValue(metadata.employee_details_review);
    const previousSections = recordValue(previousReview.sections);
    const sections = Object.fromEntries(
      EMPLOYEE_DETAIL_SECTIONS.map(([key]) => {
        const previous = recordValue(previousSections[key]);
        const wasApproved = previous.status === 'approved';
        return [
          key,
          {
            status: wasApproved ? 'approved' : 'pending',
            comment:
              typeof previous.comment === 'string' ? previous.comment : null,
            reviewed_at:
              wasApproved && typeof previous.reviewed_at === 'string'
                ? previous.reviewed_at
                : null,
            reviewed_by_company_user_id:
              wasApproved &&
              typeof previous.reviewed_by_company_user_id === 'number'
                ? previous.reviewed_by_company_user_id
                : null,
          } satisfies EmployeeDetailReviewDecision,
        ];
      }),
    );
    metadata.employee_details_review = {
      status: 'submitted',
      submitted_at: submittedAt.toISOString(),
      submitted_by_user_id: actor.id,
      reviewed_at: null,
      sections,
    };
    request.metadata = metadata;
    await this.onboardingRequestRepository.save(request);

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: request.id,
      action: 'onboarding_employee_details.submitted',
      entity_name: 'onboarding_request',
      entity_id: request.id,
      actor,
      payload: { submitted_at: submittedAt.toISOString() },
    });

    if (
      request.created_by_company_user_id &&
      request.employee.company_user_id
    ) {
      const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;
      this.eventEmitter.emit(
        OnboardingEmployeeDetailsSubmittedEvent.EVENT,
        new OnboardingEmployeeDetailsSubmittedEvent(
          companyId,
          request.id,
          request.onboarding_no,
          `${request.employee.first_name} ${request.employee.last_name}`.trim(),
          request.created_by_company_user_id,
          request.employee.company_user_id,
          `${frontendUrl}/dashboard/employees/onboarding?tab=requests&request_id=${request.id}`,
        ),
      );
    }

    return this.findOneOnboardingRequest(companyId, request.id, actor);
  }

  async reviewEmployeeDetails(
    companyId: number,
    onboardingRequestId: number,
    dto: ReviewOnboardingEmployeeDetailsDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);
    if (
      [
        OnboardingRequestStatusEnum.CANCELLED,
        OnboardingRequestStatusEnum.COMPLETED,
        OnboardingRequestStatusEnum.ACTIVATING,
      ].includes(request.status)
    ) {
      throw new ConflictException(
        'Employee details cannot be reviewed after onboarding is closed',
      );
    }

    const validKeys = new Set(EMPLOYEE_DETAIL_SECTIONS.map(([key]) => key));
    const metadata = { ...(request.metadata ?? {}) };
    const previousReview = recordValue(metadata.employee_details_review);
    const previousSections = recordValue(previousReview.sections);
    const reviewedAt = new Date();

    for (const section of dto.sections) {
      if (
        !validKeys.has(
          section.section_key as (typeof EMPLOYEE_DETAIL_SECTIONS)[number][0],
        )
      ) {
        throw new BadRequestException(
          `Unknown employee detail section: ${section.section_key}`,
        );
      }
      const comment = section.comment?.trim() || null;
      if (section.status === 'changes_requested' && !comment) {
        throw new BadRequestException(
          `A reason is required when returning ${section.section_key} for changes`,
        );
      }
      previousSections[section.section_key] = {
        status: section.status,
        comment,
        reviewed_at: reviewedAt.toISOString(),
        reviewed_by_company_user_id: actor.companyMembershipId ?? null,
      } satisfies EmployeeDetailReviewDecision;
    }

    const decisions = EMPLOYEE_DETAIL_SECTIONS.map(([key]) =>
      recordValue(previousSections[key]),
    );
    const hasChangesRequested = decisions.some(
      (section) => section.status === 'changes_requested',
    );
    const allApproved = decisions.every(
      (section) => section.status === 'approved',
    );
    const reviewStatus = hasChangesRequested
      ? 'changes_requested'
      : allApproved
        ? 'approved'
        : 'in_review';
    metadata.employee_details_review = {
      ...previousReview,
      status: reviewStatus,
      reviewed_at: reviewedAt.toISOString(),
      sections: previousSections,
    };
    request.metadata = metadata;
    await this.onboardingRequestRepository.save(request);

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: request.id,
      action: hasChangesRequested
        ? 'onboarding_employee_details.changes_requested'
        : 'onboarding_employee_details.reviewed',
      entity_name: 'onboarding_request',
      entity_id: request.id,
      actor,
      payload: { status: reviewStatus, sections: dto.sections },
    });

    if (hasChangesRequested && request.employee.company_user_id) {
      const changedKeys = new Set(
        dto.sections
          .filter((section) => section.status === 'changes_requested')
          .map((section) => section.section_key),
      );
      const returnedLabels = EMPLOYEE_DETAIL_SECTIONS.filter(([key]) =>
        changedKeys.has(key),
      ).map(([, label]) => label);
      const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;
      if (returnedLabels.length > 0) {
        this.eventEmitter.emit(
          OnboardingEmployeeDetailsReturnedEvent.EVENT,
          new OnboardingEmployeeDetailsReturnedEvent(
            companyId,
            request.id,
            request.onboarding_no,
            `${request.employee.first_name} ${request.employee.last_name}`.trim(),
            request.employee.company_user_id,
            actor.companyMembershipId ?? null,
            returnedLabels,
            `${frontendUrl}/dashboard/me/onboarding`,
          ),
        );
      }
    }

    if (request.employee.company_user_id) {
      const approvedKeys = new Set(
        dto.sections
          .filter((section) => section.status === 'approved')
          .map((section) => section.section_key),
      );
      const approvedLabels = EMPLOYEE_DETAIL_SECTIONS.filter(([key]) =>
        approvedKeys.has(key),
      ).map(([, label]) => label);
      if (approvedLabels.length > 0) {
        const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;
        this.eventEmitter.emit(
          OnboardingEmployeeDetailsReviewedEvent.EVENT,
          new OnboardingEmployeeDetailsReviewedEvent(
            companyId,
            request.id,
            request.onboarding_no,
            `${request.employee.first_name} ${request.employee.last_name}`.trim(),
            request.employee.company_user_id,
            actor.companyMembershipId ?? null,
            approvedLabels,
            `${frontendUrl}/dashboard/me/onboarding`,
          ),
        );
      }
    }

    return this.findOneOnboardingRequest(companyId, request.id, actor);
  }

  async submitDraftOnboardingRequest(
    companyId: number,
    onboardingRequestId: number,
    dto: StartOnboardingWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);
    if (request.status !== OnboardingRequestStatusEnum.DRAFT) {
      throw new ConflictException(
        'Only a draft onboarding request can be started',
      );
    }

    const review = recordValue(request.metadata?.employee_details_review);
    const detailsApproved = review.status === 'approved';
    if (!detailsApproved && !dto.allow_incomplete_employee_details) {
      throw new BadRequestException(
        'Employee details must be submitted and approved before starting the workflow. Enable the incomplete-details override to start it early.',
      );
    }

    const submitted = await this.dataSource.transaction(async (manager) => {
      const repository = this.getOnboardingRequestRepository(manager);
      const current = await repository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      if (current.status !== OnboardingRequestStatusEnum.DRAFT) {
        throw new ConflictException(
          'This onboarding request has already been started',
        );
      }
      if (!current.workflow_id) {
        throw new BadRequestException(
          'Select an onboarding workflow before starting this request',
        );
      }

      const workflow = await this.findOnboardingWorkflowOrFail(
        companyId,
        current.workflow_id,
        manager,
      );
      const approvers = await this.onboardingWorkflowService.prepareApprovers(
        companyId,
        workflow.steps,
        manager,
      );
      if (approvers.failures.length) {
        throw new BadRequestException(
          `Required workflow step at order ${approvers.failures[0].step_order} has no eligible assignee`,
        );
      }
      if (
        !approvers.assignments.some(({ membershipIds }) => membershipIds.length)
      ) {
        throw new BadRequestException('Workflow has no eligible assignees');
      }

      await this.getOnboardingApprovalRepository(manager).delete({
        onboarding_request_id: current.id,
      });
      await this.getOnboardingTaskRepository(manager).delete({
        onboarding_request_id: current.id,
      });
      const initialized =
        await this.onboardingWorkflowService.initializeApprovalsForRequest(
          companyId,
          current,
          workflow.id,
          manager,
          approvers,
        );
      await this.createTasksFromWorkflowSteps(
        current,
        initialized.steps,
        actor,
        manager,
      );

      current.status = OnboardingRequestStatusEnum.SUBMITTED;
      current.submitted_at = new Date();
      current.started_at = current.submitted_at;
      current.metadata = {
        ...(current.metadata ?? {}),
        workflow_start: {
          started_at: current.submitted_at.toISOString(),
          started_by_company_user_id: actor.companyMembershipId ?? null,
          employee_details_approved: detailsApproved,
          incomplete_details_override: !detailsApproved,
        },
      };
      await repository.save(current);
      await this.updateRequestProgress(current, manager);

      return repository.findOneOrFail({
        where: { id: current.id },
        relations: {
          employee: {
            company_user: true,
            primary_department: true,
            primary_position: true,
          },
          workflow: true,
          tasks: true,
          approvals: { approver: { user: true }, workflow_step: true },
        },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: submitted.id,
      action: 'onboarding_request.submitted',
      entity_name: 'onboarding_request',
      entity_id: submitted.id,
      actor,
      payload: {
        employee_details_approved: detailsApproved,
        incomplete_details_override: !detailsApproved,
      },
    });
    this.emitOnboardingSubmitted(companyId, submitted, actor).catch(() => {});

    return this.mapRequest(submitted);
  }

  async findAllOnboardingRequests(
    companyId: number,
    query: OnboardingRequestQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      employee_id,
      status,
    } = query;

    const qb = this.onboardingRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('employee.company_user', 'membership')
      .leftJoinAndSelect('employee.primary_department', 'department')
      .leftJoinAndSelect('employee.primary_position', 'position')
      .leftJoinAndSelect('request.workflow', 'workflow')
      .leftJoinAndSelect('request.tasks', 'tasks')
      .leftJoinAndSelect('request.approvals', 'approvals')
      .leftJoinAndSelect('approvals.approver', 'approvalMembership')
      .leftJoinAndSelect('approvalMembership.user', 'approvalUser')
      .leftJoinAndSelect('approvals.workflow_step', 'workflowStep')
      .where('request.company_id = :companyId', { companyId });

    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (accessibleEmployeeIds !== null) {
      if (accessibleEmployeeIds.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('request.employee_id IN (:...accessibleEmployeeIds)', {
          accessibleEmployeeIds,
        });
      }
    }

    if (typeof employee_id === 'number') {
      qb.andWhere('request.employee_id = :employeeId', {
        employeeId: employee_id,
      });
    }

    if (status?.trim()) {
      qb.andWhere('request.status = :status', { status: status.trim() });
    }

    if (search?.trim()) {
      qb.andWhere(
        '(request.onboarding_no LIKE :term OR employee.employee_no LIKE :term)',
        {
          term: `%${search.trim()}%`,
        },
      );
    }

    const allowedSortFields = [
      'id',
      'onboarding_no',
      'status',
      'progress_percentage',
      'created_at',
      'updated_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`request.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    if (typeof employee_id === 'number') {
      const employee = await this.findEmployeeOrFail(companyId, employee_id);
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    }

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: In(items.map((item) => item.id)),
      },
    });
    const documentsMap = new Map<number, Document[]>();
    documents.forEach((document) => {
      const current = documentsMap.get(document.entity_id) ?? [];
      current.push(document);
      documentsMap.set(document.entity_id, current);
    });

    return {
      data: items.map((item) =>
        this.mapRequest(item, documentsMap.get(item.id) ?? []),
      ),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneOnboardingRequest(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: request.id,
      },
      order: { created_at: 'DESC' },
    });

    return this.mapRequest(request, documents);
  }

  async completeOnboarding(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (request.status === OnboardingRequestStatusEnum.CANCELLED) {
      throw new BadRequestException('Onboarding request is already closed');
    }
    if (request.status === OnboardingRequestStatusEnum.COMPLETED) {
      return { message: 'Onboarding already completed', data: null };
    }

    const hasOpenTasks = request.tasks.some(
      (task) => task.status !== OnboardingTaskStatusEnum.COMPLETED,
    );
    if (hasOpenTasks) {
      throw new BadRequestException(
        'All onboarding tasks must be completed before finalizing',
      );
    }

    const hasRejectedApproval = request.approvals.some(
      (approval) => approval.status === OnboardingApprovalStatusEnum.REJECTED,
    );
    if (hasRejectedApproval) {
      throw new BadRequestException(
        'Cannot complete onboarding with rejected approval decisions',
      );
    }

    const hasPendingApproval = request.approvals.some(
      (approval) => approval.status === OnboardingApprovalStatusEnum.PENDING,
    );
    if (hasPendingApproval) {
      throw new BadRequestException(
        'All onboarding approvals must be completed before finalizing',
      );
    }

    const completed = await this.dataSource.transaction(async (manager) => {
      const requestRepository = this.getOnboardingRequestRepository(manager);
      const employeeRepository = this.getEmployeeRepository(manager);

      const current = await requestRepository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
        relations: { employee: { company_user: true } },
      });

      const readiness = await this.getPayrollAndContractReadiness(
        companyId,
        current.employee_id,
        manager,
      );
      if (readiness.length) {
        throw new BadRequestException(`Employee is not ready for activation: ${readiness.join(', ')}`);
      }

      await this.applyProvisioningSelections(
        companyId,
        current,
        actor,
        manager,
      );

      current.status = OnboardingRequestStatusEnum.COMPLETED;
      current.completed_at = new Date();
      current.finalized_by_company_user_id = actor.companyMembershipId ?? null;
      current.progress_percentage = '100.00';
      current.current_approval_level = 0;
      await requestRepository.save(current);

      const employee = await employeeRepository.findOneOrFail({
        where: { id: current.employee_id },
      });
      employee.employment_status = EmploymentStatusEnum.ACTIVE;
      if (!employee.hire_date) {
        employee.hire_date = formatDateOnly(new Date());
      }
      await employeeRepository.save(employee);
      await this.initializeLeaveBalancesForEmployee(
        companyId,
        employee,
        manager,
      );
      await this.probationService.ensureCaseForEmployee(
        companyId,
        employee,
        actor,
        manager,
      );

      return requestRepository.findOneOrFail({
        where: { id: current.id },
        relations: {
          employee: {
            company_user: true,
            primary_department: true,
            primary_position: true,
          },
          workflow: true,
          tasks: true,
          approvals: { approver: { user: true }, workflow_step: true },
        },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: completed.id,
      action: 'onboarding_request.completed',
      entity_name: 'onboarding_request',
      entity_id: completed.id,
      actor,
    });

    this.emitOnboardingCompleted(companyId, completed, actor).catch(() => {});

    return {
      message: 'Onboarding completed successfully',
      data: this.mapRequest(completed),
    };
  }

  private async getPayrollAndContractReadiness(
    companyId: number,
    employeeId: number,
    manager: EntityManager,
  ): Promise<string[]> {
    const employee = await manager.getRepository(Employee).findOneOrFail({
      where: { id: employeeId, company_id: companyId },
    });
    const [profile, salary, contract] = await Promise.all([
      manager.getRepository(EmployeePayrollProfile).findOne({
        where: { companyId, employeeId, payrollEnabled: true, payrollHold: false },
      }),
      manager.getRepository(EmployeeCompensationVersion).findOne({
        where: { companyId, employeeId, status: EmployeeCompensationVersionStatusEnum.ACTIVE },
        order: { effectiveFrom: 'DESC' },
      }),
      manager.getRepository(EmploymentContract).findOne({
        where: { companyId, employeeId, status: EmploymentContractStatus.SIGNED },
        order: { version: 'DESC' },
      }),
    ]);
    const missing: string[] = [];
    if (!employee.primary_position_id) missing.push('position');
    if (!employee.reports_to) missing.push('reporting manager');
    if (!profile) missing.push('payroll profile');
    if (!profile?.taxpayerIdentificationNumber) missing.push('TIN');
    if (!profile?.socialSecuritySchemeCode || !profile.socialSecurityNumber) missing.push('pension enrollment');
    if (!profile?.healthInsuranceSchemeCode || !profile.healthInsuranceNumber) missing.push('health enrollment');
    if (!profile?.primaryBankAccountId) {
      missing.push('bank account');
    } else {
      const bank = await manager.getRepository(EmployeeBankAccount).findOne({
        where: { id: profile.primaryBankAccountId, employee_id: employeeId },
      });
      if (!bank || bank.verification_status !== 'VERIFIED') missing.push('verified bank account');
    }
    const effectiveDate = employee.hire_date ?? new Date().toISOString().slice(0, 10);
    if (!salary || salary.effectiveFrom > effectiveDate || (salary.effectiveTo && salary.effectiveTo < effectiveDate) ||
      !salary.approvedByCompanyUserId || salary.approvedByCompanyUserId === salary.createdByCompanyUserId) {
      missing.push('independently approved starting salary');
    }
    if (!contract || contract.startDate > effectiveDate || (contract.endDate && contract.endDate < effectiveDate)) missing.push('signed employment contract');
    return missing;
  }

  async cancelOnboarding(
    companyId: number,
    onboardingRequestId: number,
    dto: CancelOnboardingRequestDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OnboardingRequestStatusEnum.CANCELLED ||
      request.status === OnboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Onboarding request is already closed');
    }

    const cancelled = await this.dataSource.transaction(async (manager) => {
      const requestRepository = this.getOnboardingRequestRepository(manager);
      const taskRepository = this.getOnboardingTaskRepository(manager);
      const current = await requestRepository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });

      await this.onboardingWorkflowService.closeAllPendingApprovals(
        current.id,
        'Skipped after onboarding cancellation',
        manager,
      );

      const openTasks = await taskRepository.find({
        where: {
          onboarding_request_id: current.id,
          status: In([
            OnboardingTaskStatusEnum.PENDING,
            OnboardingTaskStatusEnum.IN_PROGRESS,
          ]),
        },
      });
      if (openTasks.length) {
        openTasks.forEach((task) => {
          task.status = OnboardingTaskStatusEnum.CANCELLED;
          task.cancelled_at = new Date();
          task.completion_notes =
            task.completion_notes ?? 'Task cancelled with onboarding';
        });
        await taskRepository.save(openTasks);
      }

      current.status = OnboardingRequestStatusEnum.CANCELLED;
      current.cancelled_at = new Date();
      current.rejection_reason = dto.reason?.trim() || null;
      await requestRepository.save(current);
      await this.updateRequestProgress(current, manager);

      return current;
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: cancelled.id,
      action: 'onboarding_request.cancelled',
      entity_name: 'onboarding_request',
      entity_id: cancelled.id,
      actor,
      payload: { reason: dto.reason ?? null },
    });

    return { message: 'Onboarding request cancelled successfully' };
  }

  async createTask(
    companyId: number,
    onboardingRequestId: number,
    dto: CreateOnboardingTaskDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OnboardingRequestStatusEnum.CANCELLED ||
      request.status === OnboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException(
        'Cannot add task to closed onboarding request',
      );
    }

    if (dto.assigned_department_id) {
      const department = await this.departmentRepository.findOne({
        where: {
          id: dto.assigned_department_id,
          company_id: companyId,
        },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    if (dto.assigned_company_user_id) {
      const membership = await this.companyUserRepository.findOne({
        where: {
          id: dto.assigned_company_user_id,
          company_id: companyId,
        },
      });
      if (!membership) {
        throw new NotFoundException('Assigned company user not found');
      }
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOnboardingTaskRepository(manager);
      const requestRepository = this.getOnboardingRequestRepository(manager);

      const task = await taskRepository.save(
        taskRepository.create({
          onboarding_request_id: onboardingRequestId,
          workflow_step_id: null,
          task_no: await this.generateTaskNo(onboardingRequestId, manager),
          title: dto.title.trim(),
          description: this.normalizeOptionalString(dto.description),
          task_type: dto.task_type ?? OnboardingTaskTypeEnum.GENERAL,
          status: OnboardingTaskStatusEnum.PENDING,
          assigned_department_id: dto.assigned_department_id ?? null,
          assigned_company_user_id: dto.assigned_company_user_id ?? null,
          due_date: dto.due_date ? new Date(dto.due_date) : null,
          created_by_company_user_id: actor.companyMembershipId ?? null,
        }),
      );

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return task;
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_task.created',
      entity_name: 'onboarding_task',
      entity_id: created.id,
      actor,
    });

    this.emitOnboardingTaskAssigned(
      companyId,
      onboardingRequestId,
      created,
      actor,
    ).catch(() => {});

    return this.mapTask(created);
  }

  async completeTask(
    companyId: number,
    onboardingRequestId: number,
    taskId: number,
    dto: CompleteOnboardingTaskDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );

    const task = await this.onboardingTaskRepository.findOne({
      where: {
        id: taskId,
        onboarding_request_id: onboardingRequestId,
      },
      relations: { workflow_step: true },
    });
    if (!task) {
      throw new NotFoundException('Onboarding task not found');
    }

    if (task.status === OnboardingTaskStatusEnum.COMPLETED) {
      throw new BadRequestException('Task is already completed');
    }
    if (task.status === OnboardingTaskStatusEnum.CANCELLED) {
      throw new BadRequestException('Task is cancelled');
    }

    await this.assertCanCompleteTask(actor, task);

    if (
      task.task_type === OnboardingTaskTypeEnum.DOCUMENT ||
      task.task_type === OnboardingTaskTypeEnum.ACKNOWLEDGEMENT ||
      task.task_type === OnboardingTaskTypeEnum.SYSTEM
    ) {
      throw new BadRequestException(
        'This task type is managed automatically and cannot be completed manually',
      );
    }

    const updated = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOnboardingTaskRepository(manager);
      const requestRepository = this.getOnboardingRequestRepository(manager);
      const documentRepository = this.getDocumentRepository(manager);

      const currentTask = await taskRepository.findOneOrFail({
        where: { id: taskId, onboarding_request_id: onboardingRequestId },
      });

      if (
        currentTask.completion_evidence_required &&
        !dto.evidence_document_id
      ) {
        throw new BadRequestException(
          'evidence_document_id is required to complete this task',
        );
      }

      if (dto.evidence_document_id) {
        const evidenceDocument = await documentRepository.findOne({
          where: {
            id: dto.evidence_document_id,
            company_id: companyId,
            entity_type: DocumentEntityTypeEnum.ONBOARDING,
            entity_id: onboardingRequestId,
          },
        });

        if (!evidenceDocument) {
          throw new NotFoundException('Evidence document not found');
        }

        if (
          currentTask.required_document_type_code &&
          evidenceDocument.document_type !==
            currentTask.required_document_type_code
        ) {
          throw new BadRequestException(
            'Evidence document type does not satisfy this task requirement',
          );
        }

        if (
          currentTask.requires_verified_document &&
          !evidenceDocument.is_verified
        ) {
          throw new BadRequestException(
            'A verified onboarding document is required to complete this task',
          );
        }
      }

      currentTask.status = OnboardingTaskStatusEnum.COMPLETED;
      currentTask.started_at = currentTask.started_at ?? new Date();
      currentTask.completed_at = new Date();
      currentTask.completed_by_company_user_id =
        actor.companyMembershipId ?? null;
      currentTask.completion_notes = dto.completion_notes?.trim() || null;
      currentTask.evidence_document_id = dto.evidence_document_id ?? null;
      currentTask.completion_data = dto.completion_data ?? null;
      await taskRepository.save(currentTask);

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return currentTask;
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_task.completed',
      entity_name: 'onboarding_task',
      entity_id: updated.id,
      actor,
    });

    await this.eventEmitter.emitAsync(
      OnboardingTaskCompletedEvent.EVENT,
      new OnboardingTaskCompletedEvent(companyId, request.id, updated.id),
    );

    return this.mapTask(updated);
  }

  async findAllTasks(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const tasks = await this.onboardingTaskRepository.find({
      where: { onboarding_request_id: onboardingRequestId },
      relations: {
        assigned_department: true,
        assigned_company_user: { user: true },
        completed_by_company_user: { user: true },
      },
      order: { task_no: 'ASC' },
    });

    return tasks.map((t) => this.mapTask(t));
  }

  async findOneTask(
    companyId: number,
    onboardingRequestId: number,
    taskId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const task = await this.onboardingTaskRepository.findOne({
      where: { id: taskId, onboarding_request_id: onboardingRequestId },
      relations: {
        assigned_department: true,
        assigned_company_user: { user: true },
        completed_by_company_user: { user: true },
      },
    });
    if (!task) throw new NotFoundException('Task not found');

    return this.mapTask(task);
  }

  async reassignTask(
    companyId: number,
    onboardingRequestId: number,
    taskId: number,
    dto: {
      assigned_company_user_id?: number;
      assigned_department_id?: number;
      due_date?: string;
    },
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const task = await this.onboardingTaskRepository.findOneOrFail({
      where: { id: taskId, onboarding_request_id: onboardingRequestId },
    });

    if (dto.assigned_company_user_id !== undefined) {
      task.assigned_company_user_id = dto.assigned_company_user_id;
    }
    if (dto.assigned_department_id !== undefined) {
      task.assigned_department_id = dto.assigned_department_id;
    }
    if (dto.due_date !== undefined) {
      task.due_date = dto.due_date ? new Date(dto.due_date) : null;
    }

    const updated = await this.onboardingTaskRepository.save(task);

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_task.reassigned',
      entity_name: 'onboarding_task',
      entity_id: taskId,
      actor,
      payload: {
        assigned_company_user_id: updated.assigned_company_user_id,
        assigned_department_id: updated.assigned_department_id,
        due_date: updated.due_date,
      },
    });

    return this.mapTask(updated);
  }

  async applyApprovalAction(
    companyId: number,
    onboardingRequestId: number,
    dto: OnboardingApprovalActionDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    const membershipId = await this.resolveActiveCompanyMembershipId(
      companyId,
      actor,
    );

    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const updated = await this.dataSource.transaction(async (manager) => {
      const current = await this.onboardingWorkflowService.applyApprovalAction(
        onboardingRequestId,
        membershipId,
        dto,
        manager,
      );
      await this.updateRequestProgress(current, manager);

      return this.getOnboardingRequestRepository(manager).findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
        relations: {
          employee: {
            company_user: true,
            primary_department: true,
            primary_position: true,
          },
          workflow: true,
          tasks: true,
          approvals: { approver: { user: true }, workflow_step: true },
        },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: updated.id,
      action: dto.approve
        ? 'onboarding_request.approved_step'
        : 'onboarding_request.rejected',
      entity_name: 'onboarding_request',
      entity_id: updated.id,
      actor,
      payload: {
        status: updated.status,
        current_approval_level: updated.current_approval_level,
      },
    });

    const documents = await this.loadOnboardingDocuments(companyId, updated.id);

    // Auto-complete when all approvals and tasks are done
    if (dto.approve) {
      const allApprovalsFinalised = updated.approvals.every(
        (a) => a.status !== OnboardingApprovalStatusEnum.PENDING,
      );
      const allTasksDone = updated.tasks.every(
        (t) =>
          t.status === OnboardingTaskStatusEnum.COMPLETED ||
          t.status === OnboardingTaskStatusEnum.CANCELLED,
      );
      if (allApprovalsFinalised && allTasksDone) {
        await this.completeOnboarding(companyId, onboardingRequestId, actor);
      }
    }

    return this.mapRequest(updated, documents);
  }

  private async resolveActiveCompanyMembershipId(
    companyId: number,
    actor: AuthenticatedUser,
  ): Promise<number> {
    const membership = await this.companyUserRepository.findOne({
      where: {
        company_id: companyId,
        user_id: actor.id,
        status: 'active',
      },
      select: ['id'],
    });

    if (!membership) {
      throw new ForbiddenException(
        'Your active company membership could not be verified',
      );
    }

    return membership.id;
  }

  async delegateApproval(
    companyId: number,
    onboardingRequestId: number,
    approvalId: number,
    dto: DelegateOnboardingApprovalDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    if (!hasPermission(actor.permissions, 'onboarding_requests:update')) {
      throw new ForbiddenException(
        'You do not have permission to change onboarding approvers',
      );
    }

    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const delegated = await this.dataSource.transaction(async (manager) => {
      const approvalRepository = this.getOnboardingApprovalRepository(manager);
      const companyUserRepository = this.getCompanyUserRepository(manager);

      const approval = await approvalRepository.findOneOrFail({
        where: {
          id: approvalId,
          onboarding_request_id: onboardingRequestId,
        },
      });

      if (approval.status !== OnboardingApprovalStatusEnum.PENDING) {
        throw new BadRequestException(
          'Only pending approvals can be delegated',
        );
      }

      const delegate = await companyUserRepository.findOne({
        where: {
          id: dto.delegate_company_user_id,
          company_id: companyId,
          status: 'active',
        },
        relations: {
          user: true,
          role_assignments: {
            role: {
              permissions: true,
            },
          },
          permission_assignments: {
            permission: true,
          },
        },
      });

      if (!delegate) {
        throw new NotFoundException('Delegate company user not found');
      }

      if (delegate.id === approval.approver_company_user_id) {
        throw new BadRequestException(
          'The delegate must be different from the current approver',
        );
      }

      const delegatePermissions = new Set<string>();
      delegate.permission_assignments?.forEach((assignment) => {
        if (assignment.permission?.name) {
          delegatePermissions.add(assignment.permission.name);
        }
      });
      delegate.role_assignments?.forEach((assignment) => {
        assignment.role?.permissions?.forEach((permission) => {
          if (permission?.name) {
            delegatePermissions.add(permission.name);
          }
        });
      });
      if (
        !hasPermission(
          Array.from(delegatePermissions),
          'onboarding_requests:approve',
        )
      ) {
        const delegateName = [
          delegate.user?.first_name,
          delegate.user?.last_name,
        ]
          .filter(Boolean)
          .join(' ')
          .trim();
        throw new BadRequestException({
          statusCode: 400,
          code: 'ONBOARDING_ASSIGNEE_PERMISSION_REQUIRED',
          message: `${delegateName || `User #${delegate.user_id}`} cannot be assigned as an approver because they do not have onboarding_requests:approve.`,
          assigned_user_id: delegate.id,
          required_permission: 'onboarding_requests:approve',
          permission_fix_path: `/dashboard/companies?membership_id=${delegate.id}&permission=onboarding_requests%3Aapprove`,
        });
      }

      approval.original_approver_company_user_id =
        approval.original_approver_company_user_id ??
        approval.approver_company_user_id;
      approval.delegated_from_company_user_id =
        approval.approver_company_user_id ?? null;
      approval.approver_company_user_id = delegate.id;
      approval.delegated_at = new Date();
      approval.delegation_reason = dto.reason.trim();

      return approvalRepository.save(approval);
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_approval.delegated',
      entity_name: 'onboarding_approval',
      entity_id: delegated.id,
      actor,
      payload: {
        delegate_company_user_id: delegated.approver_company_user_id,
        delegated_from_company_user_id:
          delegated.delegated_from_company_user_id,
      },
    });

    if (delegated.approval_level === request.current_approval_level) {
      const delegate = await this.companyUserRepository.findOne({
        where: {
          id: delegated.approver_company_user_id ?? 0,
          company_id: companyId,
          status: 'active',
        },
        relations: { user: true },
      });
      const recipient = buildNotificationRecipient(delegate?.user, {
        companyUserId: delegate?.id,
      });
      if (recipient) {
        const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;
        const employeeName =
          `${request.employee.first_name} ${request.employee.last_name}`.trim();
        this.eventEmitter.emit(
          OnboardingApprovalRequiredEvent.EVENT,
          new OnboardingApprovalRequiredEvent(
            employeeName,
            [recipient],
            `${frontendUrl}/dashboard/employees/onboarding?tab=requests&request_id=${request.id}`,
            request.id,
            companyId,
            actor.companyMembershipId ?? null,
            request.onboarding_no,
          ),
        );
      }
    }

    return this.mapApproval(delegated);
  }

  async acknowledgeOnboarding(
    companyId: number,
    onboardingRequestId: number,
    dto: AcknowledgeOnboardingDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext = EMPTY_AUDIT_CONTEXT,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    if (
      actor.employeeId !== request.employee_id &&
      actor.companyMembershipId !== request.employee.company_user_id
    ) {
      throw new ForbiddenException(
        'Only the employee on this onboarding request can acknowledge it',
      );
    }

    if (!dto.accepted) {
      throw new BadRequestException(
        'accepted must be true to acknowledge onboarding',
      );
    }

    const expectedVersion =
      this.configService.get<string>('ONBOARDING_ACKNOWLEDGEMENT_VERSION') ??
      null;
    if (expectedVersion && dto.acknowledgement_version !== expectedVersion) {
      throw new BadRequestException(
        `acknowledgement_version must match the active version ${expectedVersion}`,
      );
    }

    const updated = await this.dataSource.transaction(async (manager) => {
      const requestRepository = this.getOnboardingRequestRepository(manager);
      const taskRepository = this.getOnboardingTaskRepository(manager);

      const current = await requestRepository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      current.employee_acknowledged_at = new Date();
      current.employee_acknowledged_by_user_id = actor.id;
      current.employee_acknowledgement_version = dto.acknowledgement_version;
      current.employee_acknowledgement_ip = context.ipAddress;
      await requestRepository.save(current);

      const acknowledgementTasks = await taskRepository.find({
        where: {
          onboarding_request_id: onboardingRequestId,
          task_type: OnboardingTaskTypeEnum.ACKNOWLEDGEMENT,
          status: OnboardingTaskStatusEnum.PENDING,
        },
      });

      for (const task of acknowledgementTasks) {
        task.status = OnboardingTaskStatusEnum.COMPLETED;
        task.started_at = task.started_at ?? new Date();
        task.completed_at = new Date();
        task.completed_by_company_user_id = actor.companyMembershipId ?? null;
        task.completion_notes = 'Completed from employee acknowledgement';
        task.completion_data = {
          acknowledgement_version: dto.acknowledgement_version,
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
          request_id: context.requestId,
        };
        await taskRepository.save(task);
      }

      await this.updateRequestProgress(current, manager);

      return requestRepository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
        relations: {
          employee: {
            company_user: true,
            primary_department: true,
            primary_position: true,
          },
          workflow: true,
          tasks: true,
          approvals: { approver: { user: true }, workflow_step: true },
        },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_request.acknowledged',
      entity_name: 'onboarding_request',
      entity_id: onboardingRequestId,
      actor,
      payload: {
        acknowledgement_version: dto.acknowledgement_version,
        ip_address: context.ipAddress,
        request_id: context.requestId,
      },
    });

    const documents = await this.loadOnboardingDocuments(companyId, updated.id);
    return this.mapRequest(updated, documents);
  }

  async addDocument(
    companyId: number,
    onboardingRequestId: number,
    dto: UploadDocumentDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);
    const storedFile = await this.filesService.savePrivateBase64File(dto.file, {
      directorySegments: ['documents', 'onboarding', `company-${companyId}`],
      fileNamePrefix: `onboarding-${onboardingRequestId}`,
      allowedMimeTypes: [...HR_PRIVATE_DOCUMENT_MIME_TYPES],
      maxFileSizeBytes: HR_PRIVATE_DOCUMENT_MAX_BYTES,
      validateFileSignature: true,
    });

    const document = await this.dataSource.transaction(async (manager) => {
      const repository = this.getDocumentRepository(manager);
      const created = await repository.save(
        repository.create({
          company_id: companyId,
          entity_type: DocumentEntityTypeEnum.ONBOARDING,
          entity_id: onboardingRequestId,
          module: DocumentModuleEnum.ONBOARDING,
          document_type: this.normalizeOptionalString(dto.document_type),
          title: dto.title.trim(),
          description: this.normalizeOptionalString(dto.description),
          file_name: storedFile.storedFileName,
          original_file_name: storedFile.originalFileName,
          mime_type: storedFile.mimeType,
          file_extension: storedFile.fileExtension,
          file_size: String(storedFile.fileSize),
          file_path: storedFile.publicPath,
          uploaded_by_company_user_id: actor.companyMembershipId ?? null,
          expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
        }),
      );

      await this.synchronizeDocumentTasks(
        companyId,
        onboardingRequestId,
        manager,
      );

      const currentRequest = await this.getOnboardingRequestRepository(
        manager,
      ).findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return created;
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_document.uploaded',
      entity_name: 'document',
      entity_id: document.id,
      actor,
      payload: {
        title: document.title,
        document_type: document.document_type,
      },
    });

    return this.mapDocument(document);
  }

  async downloadDocument(
    companyId: number,
    onboardingRequestId: number,
    documentId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );

    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: onboardingRequestId,
      },
    });

    if (!document) {
      throw new NotFoundException('Onboarding document not found');
    }

    const buffer = await this.filesService.readManagedFile(document.file_path);

    if (!buffer) {
      throw new NotFoundException(
        'Onboarding document file was not found in storage',
      );
    }

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_document.downloaded',
      entity_name: 'document',
      entity_id: document.id,
      actor,
      payload: {
        title: document.title,
      },
    });

    return {
      buffer,
      fileName: document.original_file_name ?? document.file_name,
      mimeType: document.mime_type ?? 'application/octet-stream',
    };
  }

  async verifyDocument(
    companyId: number,
    onboardingRequestId: number,
    documentId: number,
    dto: VerifyDocumentDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: onboardingRequestId,
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    document.is_verified = dto.is_verified;
    document.verified_at = dto.is_verified ? new Date() : null;
    document.verified_by_company_user_id = dto.is_verified
      ? (actor.companyMembershipId ?? null)
      : null;

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = this.getDocumentRepository(manager);
      const persisted = await repository.save(document);
      await this.synchronizeDocumentTasks(
        companyId,
        onboardingRequestId,
        manager,
      );

      const currentRequest = await this.getOnboardingRequestRepository(
        manager,
      ).findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
      return persisted;
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: dto.is_verified
        ? 'onboarding_document.verified'
        : 'onboarding_document.unverified',
      entity_name: 'document',
      entity_id: saved.id,
      actor,
    });

    return this.mapDocument(saved);
  }

  async listDocuments(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: onboardingRequestId,
      },
      order: { created_at: 'DESC' },
    });

    return documents.map((doc) => this.mapDocument(doc));
  }

  async updateDocument(
    companyId: number,
    onboardingRequestId: number,
    documentId: number,
    dto: {
      title?: string;
      description?: string | null;
      expiry_date?: string | null;
    },
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: onboardingRequestId,
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (dto.title !== undefined) document.title = dto.title.trim();
    if (dto.description !== undefined)
      document.description = dto.description?.trim() ?? null;
    if (dto.expiry_date !== undefined)
      document.expiry_date = dto.expiry_date ? new Date(dto.expiry_date) : null;

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = this.getDocumentRepository(manager);
      const persisted = await repository.save(document);
      await this.synchronizeDocumentTasks(
        companyId,
        onboardingRequestId,
        manager,
      );

      const currentRequest = await this.getOnboardingRequestRepository(
        manager,
      ).findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
      return persisted;
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_document.updated',
      entity_name: 'document',
      entity_id: saved.id,
      actor,
      payload: { title: saved.title },
    });

    return this.mapDocument(saved);
  }

  async removeDocument(
    companyId: number,
    onboardingRequestId: number,
    documentId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: onboardingRequestId,
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const filePath = document.file_path;
    await this.dataSource.transaction(async (manager) => {
      await this.getDocumentRepository(manager).remove(document);
      await this.synchronizeDocumentTasks(
        companyId,
        onboardingRequestId,
        manager,
      );

      const currentRequest = await this.getOnboardingRequestRepository(
        manager,
      ).findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
    });
    await this.filesService.removeManagedFile(filePath);

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_document.deleted',
      entity_name: 'document',
      entity_id: documentId,
      actor,
      payload: { title: document.title },
    });
  }

  async getOnboardingProgress(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const summary = await this.dataSource.transaction(async (manager) => {
      const current = await this.getOnboardingRequestRepository(
        manager,
      ).findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      const progress = await this.updateRequestProgress(current, manager);
      return progress;
    });

    return {
      onboarding_request_id: request.id,
      onboarding_no: request.onboarding_no,
      status: request.status,
      progress_percentage: summary.progress_percentage,
      tasks: {
        total: summary.total_tasks,
        completed: summary.completed_tasks,
      },
      approvals: {
        total: summary.total_approvals,
        approved: summary.approved_approvals,
      },
    };
  }

  async getOnboardingAuditLogs(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(
      companyId,
      onboardingRequestId,
    );
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const logs = await this.onboardingAuditLogRepository.find({
      where: {
        company_id: companyId,
        onboarding_request_id: onboardingRequestId,
      },
      relations: {
        actor_company_user: {
          user: true,
        },
      },
      order: { id: 'DESC' },
    });

    return logs.map((entry) => ({
      id: entry.id,
      company_id: entry.company_id,
      onboarding_request_id: entry.onboarding_request_id,
      action: entry.action,
      entity_name: entry.entity_name,
      entity_id: entry.entity_id,
      payload: entry.payload,
      created_at: entry.created_at,
      actor_company_user_id: entry.actor_company_user_id,
      actor_user_id: entry.actor_user_id,
      actor: entry.actor_company_user?.user
        ? {
            id: entry.actor_company_user.user.id,
            first_name: entry.actor_company_user.user.first_name,
            last_name: entry.actor_company_user.user.last_name,
            email: entry.actor_company_user.user.email,
          }
        : null,
    }));
  }

  private async emitOnboardingSubmitted(
    companyId: number,
    request: OnboardingRequest,
    actor: AuthenticatedUser,
  ): Promise<void> {
    try {
      const loaded = await this.onboardingRequestRepository.findOne({
        where: { id: request.id, company_id: companyId },
        relations: {
          employee: { company_user: { user: true } },
          approvals: {
            approver: { user: true },
          },
        },
      });
      if (!loaded?.employee?.company_user?.user?.email) return;

      const employeeName = `${loaded.employee.first_name} ${loaded.employee.last_name}`;
      const employeeEmail = loaded.employee.company_user.user.email;
      const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;

      const firstLevel = Math.min(
        ...loaded.approvals.map((a) => a.approval_level).filter((l) => l > 0),
      );
      const approvers: NotificationRecipient[] = loaded.approvals
        .filter((approval) => approval.approval_level === firstLevel)
        .flatMap((approval) => {
          const recipient = buildNotificationRecipient(
            approval.approver?.user,
            {
              companyUserId: approval.approver?.id,
            },
          );
          return recipient ? [recipient] : [];
        });

      this.eventEmitter.emit(
        OnboardingSubmittedEvent.EVENT,
        new OnboardingSubmittedEvent(
          companyId,
          employeeName,
          employeeEmail,
          approvers,
          `${frontendUrl}/dashboard/employees/onboarding?tab=requests&request_id=${request.id}`,
          `${frontendUrl}/dashboard/me/onboarding?request_id=${request.id}`,
          loaded.id,
          actor.companyMembershipId ??
            loaded.created_by_company_user_id ??
            null,
          loaded.employee.company_user.id,
          loaded.onboarding_no,
        ),
      );
    } catch {
      // Ignore errors when best-effort notification fails.
    }
  }

  private async emitOnboardingCompleted(
    companyId: number,
    request: OnboardingRequest,
    actor: AuthenticatedUser,
  ): Promise<void> {
    try {
      const loaded = await this.onboardingRequestRepository.findOne({
        where: { id: request.id },
        relations: {
          employee: {
            company_user: { user: true },
            manager: { company_user: { user: true } },
          },
        },
      });
      if (!loaded?.employee?.company_user?.user?.email) return;

      const employee = loaded.employee;
      const employeeName = `${employee.first_name} ${employee.last_name}`;
      const employeeEmail = employee.company_user!.user.email;
      const managerEmail = employee.manager?.company_user?.user?.email ?? null;
      const managerName = employee.manager
        ? `${employee.manager.first_name} ${employee.manager.last_name}`
        : null;
      const frontendUrl = this.configService.get<string>('APP_FRONTEND_URL')!;

      this.eventEmitter.emit(
        OnboardingCompletedEvent.EVENT,
        new OnboardingCompletedEvent(
          employeeName,
          employeeEmail,
          managerEmail,
          managerName,
          `${frontendUrl}/dashboard/me/onboarding?request_id=${request.id}`,
          loaded.id,
          companyId,
          actor.companyMembershipId ??
            loaded.finalized_by_company_user_id ??
            null,
          employee.company_user!.id,
          employee.manager?.company_user?.id ?? null,
          loaded.onboarding_no,
        ),
      );
    } catch {
      // Ignore errors when best-effort notification fails.
    }
  }

  private async emitOnboardingTaskAssigned(
    companyId: number,
    onboardingRequestId: number,
    task: OnboardingTask,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const loadedTask = await this.onboardingTaskRepository.findOne({
      where: {
        id: task.id,
        onboarding_request_id: onboardingRequestId,
      },
      relations: {
        assigned_company_user: { user: true },
        workflow_step: true,
        onboarding_request: {
          employee: true,
        },
      },
    });

    if (!loadedTask) {
      return;
    }

    const employee = loadedTask.onboarding_request?.employee;
    const employeeName =
      `${employee?.first_name ?? ''} ${employee?.last_name ?? ''}`.trim() ||
      'Employee';

    const recipients = await this.resolveTaskRecipients(companyId, {
      assigned_user_id: loadedTask.assigned_company_user_id,
      assigned_department_id: loadedTask.assigned_department_id,
      assigned_role_id: loadedTask.workflow_step?.assigned_role_id,
    });
    this.emitTaskAssignedToRecipients({
      recipients,
      employeeName,
      task: loadedTask,
      companyId,
      onboardingRequestId,
      senderCompanyUserId: actor.companyMembershipId ?? null,
    });
  }
}
