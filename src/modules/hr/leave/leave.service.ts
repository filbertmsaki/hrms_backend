import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { Role } from '../../roles/entities/role.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { buildPaginationMeta } from '../shared/hr.utils';
import { AddLeaveDocumentDto } from './dtos/add-leave-document.dto';
import { AdjustLeaveBalanceDto } from './dtos/adjust-leave-balance.dto';
import { CancelLeaveRequestDto } from './dtos/cancel-leave-request.dto';
import { CreateHolidayDto } from './dtos/create-holiday.dto';
import { CreateLeavePolicyDto } from './dtos/create-leave-policy.dto';
import { CreateLeaveRequestDto } from './dtos/create-leave-request.dto';
import { CreateLeaveTypeDto } from './dtos/create-leave-type.dto';
import { CreateLeaveWorkflowDto } from './dtos/create-leave-workflow.dto';
import { CreateLeaveWorkflowStepDto } from './dtos/create-leave-workflow-step.dto';
import { HolidayQueryDto } from './dtos/holiday-query.dto';
import { LeaveApprovalActionDto } from './dtos/leave-approval-action.dto';
import { LeaveBalanceQueryDto } from './dtos/leave-balance-query.dto';
import { LeavePolicyQueryDto } from './dtos/leave-policy-query.dto';
import { LeaveRequestQueryDto } from './dtos/leave-request-query.dto';
import { LeaveTypeQueryDto } from './dtos/leave-type-query.dto';
import { LeaveWorkflowQueryDto } from './dtos/leave-workflow-query.dto';
import { UpdateHolidayDto } from './dtos/update-holiday.dto';
import { UpdateLeavePolicyDto } from './dtos/update-leave-policy.dto';
import { UpdateLeaveTypeDto } from './dtos/update-leave-type.dto';
import { UpdateLeaveWorkflowDto } from './dtos/update-leave-workflow.dto';
import { UpdateLeaveWorkflowStepDto } from './dtos/update-leave-workflow-step.dto';
import { UpsertLeaveMedicalDetailDto } from './dtos/upsert-leave-medical-detail.dto';
import { LeaveAccrualMethodEnum } from './enums/leave-accrual-method.enum';
import { LeaveApproverTypeEnum } from './enums/leave-approver-type.enum';
import { LeaveGenderRestrictionEnum } from './enums/leave-gender-restriction.enum';
import { LeaveRecordStatusEnum } from './enums/leave-record-status.enum';
import { LeaveStatusEnum } from './enums/leave-status.enum';
import { LeaveApprovalWorkflowStep } from './entities/leave-approval-workflow-step.entity';
import { LeaveApprovalWorkflow } from './entities/leave-approval-workflow.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveDocument } from './entities/leave-document.entity';
import { LeaveMedicalDetail } from './entities/leave-medical-detail.entity';
import { LeavePolicyType } from './entities/leave-policy-type.entity';
import { LeavePolicy } from './entities/leave-policy.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveAuditService } from './services/leave-audit.service';
import { LeaveBalanceService } from './services/leave-balance.service';
import { LeavePdfService } from './services/leave-pdf.service';
import { LeaveWorkflowService } from './services/leave-workflow.service';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { AttendanceRecalculationJob } from '../attendance/processing/entities/attendance-recalculation-job.entity';
import { AttendanceProcessingJobStatusEnum } from '../attendance/processing/enums/attendance-processing-job-status.enum';
import { AttendanceHoliday } from '../attendance/holidays/entities/holiday.entity';
import { AttendanceHolidayTypeEnum } from '../attendance/holidays/enums/attendance-holiday-type.enum';
import { HolidayGroup } from '../attendance/holidays/entities/holiday-group.entity';

type PolicyContext = {
  allowNegativeBalance: boolean;
  maxConsecutiveDays: number | null;
  minServiceMonths: number;
  requiresApproval: boolean;
  maxPerRequestDays: number | null;
};

@Injectable()
export class LeaveService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,
    @InjectRepository(LeavePolicy)
    private readonly leavePolicyRepository: Repository<LeavePolicy>,
    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepository: Repository<LeaveBalance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(LeaveApprovalWorkflow)
    private readonly leaveApprovalWorkflowRepository: Repository<LeaveApprovalWorkflow>,
    @InjectRepository(LeaveApprovalWorkflowStep)
    private readonly leaveApprovalWorkflowStepRepository: Repository<LeaveApprovalWorkflowStep>,
    @InjectRepository(LeaveMedicalDetail)
    private readonly leaveMedicalDetailRepository: Repository<LeaveMedicalDetail>,
    @InjectRepository(LeaveDocument)
    private readonly leaveDocumentRepository: Repository<LeaveDocument>,
    @InjectRepository(AttendanceHoliday)
    private readonly attendanceHolidayRepository: Repository<AttendanceHoliday>,
    @InjectRepository(HolidayGroup)
    private readonly holidayGroupRepository: Repository<HolidayGroup>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(AttendanceRecalculationJob)
    private readonly attendanceRecalculationJobRepository: Repository<AttendanceRecalculationJob>,
    private readonly hrAccessService: HrAccessService,
    private readonly leaveAuditService: LeaveAuditService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly leaveWorkflowService: LeaveWorkflowService,
    private readonly leavePdfService: LeavePdfService,
  ) {}

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

  private buildEmployeeName(employee: Employee): string {
    return [employee.first_name, employee.middle_name, employee.last_name]
      .filter((item) => !!item)
      .join(' ');
  }

  private async findEmployeeOrFail(
    companyId: number,
    employeeId: number,
    manager?: EntityManager,
  ): Promise<Employee> {
    const repository =
      manager?.getRepository(Employee) ?? this.employeeRepository;
    const employee = await repository.findOne({
      where: { id: employeeId },
      relations: {
        company_user: true,
        primary_department: true,
        primary_position: true,
      },
    });

    if (!employee || employee.company_user.company_id !== companyId) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private assertEmployeeCanRequestLeave(
    employee: Employee,
    startDate: string,
    endDate: string,
  ): void {
    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
      throw new BadRequestException(
        'Only active employees can create or submit leave requests.',
      );
    }

    if (
      employee.exit_date &&
      (startDate > employee.exit_date || endDate > employee.exit_date)
    ) {
      throw new BadRequestException(
        'Leave request dates cannot be after the employee exit date.',
      );
    }
  }

  private async findEmployeeIdByMembership(
    companyId: number,
    companyMembershipId: number,
  ): Promise<number | null> {
    const entry = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'membership')
      .where('employee.company_user_id = :companyMembershipId', {
        companyMembershipId,
      })
      .andWhere('membership.company_id = :companyId', { companyId })
      .select('employee.id', 'id')
      .getRawOne<{ id: number }>();

    return entry ? Number(entry.id) : null;
  }

  private async resolveActorEmployeeIdOrFail(
    companyId: number,
    actor: AuthenticatedUser,
  ): Promise<number> {
    if (!actor.companyMembershipId) {
      throw new ForbiddenException('Active company membership is required');
    }

    const actorEmployeeId = await this.findEmployeeIdByMembership(
      companyId,
      actor.companyMembershipId,
    );

    if (!actorEmployeeId) {
      throw new NotFoundException('Employee not found');
    }

    return actorEmployeeId;
  }

  private async resolveScopedEmployeeId(
    companyId: number,
    requestedEmployeeId: number | undefined,
    actor: AuthenticatedUser,
  ): Promise<number | null> {
    if (typeof requestedEmployeeId === 'number') {
      return requestedEmployeeId;
    }

    if (this.hrAccessService.hasCompanyWideBranchAccess(actor)) {
      return null;
    }

    if (!actor.companyMembershipId) {
      throw new ForbiddenException('Active company membership is required');
    }

    const actorEmployeeId = await this.findEmployeeIdByMembership(
      companyId,
      actor.companyMembershipId,
    );

    if (!actorEmployeeId) {
      throw new ForbiddenException(
        'Employee profile not found for current user',
      );
    }

    return actorEmployeeId;
  }

  private async assertCanAccessEmployeeById(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const isOwnEmployee =
      typeof actor.companyMembershipId === 'number' &&
      employee.company_user_id === actor.companyMembershipId;

    if (isOwnEmployee) {
      return;
    }

    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
  }

  private async findLeaveTypeOrFail(
    companyId: number,
    leaveTypeId: number,
    manager?: EntityManager,
  ): Promise<LeaveType> {
    const repository =
      manager?.getRepository(LeaveType) ?? this.leaveTypeRepository;
    const leaveType = await repository.findOne({
      where: {
        id: leaveTypeId,
        company_id: companyId,
      },
    });

    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }

    return leaveType;
  }

  private mapHolidayRecord(item: AttendanceHoliday) {
    return {
      id: item.id,
      company_id: item.companyId,
      name: item.name,
      holiday_date: item.date,
      is_recurring: item.isRecurring,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private async ensureSharedHolidayGroup(
    companyId: number,
  ): Promise<HolidayGroup> {
    const existing = await this.holidayGroupRepository.findOne({
      where: {
        companyId,
        name: 'General Holidays',
      },
    });

    if (existing) {
      return existing;
    }

    return this.holidayGroupRepository.save(
      this.holidayGroupRepository.create({
        companyId,
        name: 'General Holidays',
        description: 'Shared holiday definitions used by leave and attendance.',
      }),
    );
  }

  private async generateLeaveNo(
    companyId: number,
    manager?: EntityManager,
  ): Promise<string> {
    const repository =
      manager?.getRepository(LeaveRequest) ?? this.leaveRequestRepository;
    const year = new Date().getFullYear();
    const prefix = `LV-${year}-`;
    const latest = await repository
      .createQueryBuilder('leaveRequest')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.leave_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('leaveRequest.id', 'DESC')
      .getOne();

    const nextSequence = latest
      ? Number(latest.leave_no.split('-').pop() ?? '0') + 1
      : 1;

    return `${prefix}${String(nextSequence).padStart(6, '0')}`;
  }

  private async calculateLeaveDays(
    companyId: number,
    branchId: number | null,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    this.assertDateOrder(
      startDate,
      endDate,
      'end_date cannot be before start_date',
    );
    const attendanceHolidaysQuery = this.attendanceHolidayRepository
      .createQueryBuilder('holiday')
      .where('holiday.company_id = :companyId', { companyId })
      .andWhere('holiday.date >= :startDate', { startDate })
      .andWhere('holiday.date <= :endDate', { endDate });

    if (branchId === null) {
      attendanceHolidaysQuery.andWhere('holiday.branch_id IS NULL');
    } else {
      attendanceHolidaysQuery.andWhere(
        '(holiday.branch_id = :branchId OR holiday.branch_id IS NULL)',
        { branchId },
      );
    }

    const attendanceHolidays = await attendanceHolidaysQuery.getMany();

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const totalDays =
      Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (totalDays <= 0) {
      return 0;
    }

    let leaveDays = 0;
    for (let offset = 0; offset < totalDays; offset += 1) {
      const date = new Date(start.getTime() + offset * 86400000);
      const day = date.getUTCDay();
      if (day === 0 || day === 6) {
        continue;
      }

      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dateOfMonth = String(date.getUTCDate()).padStart(2, '0');
      const dateKey = `${date.getUTCFullYear()}-${month}-${dateOfMonth}`;

      const isAttendanceHoliday = attendanceHolidays.some((holiday) => {
        if (holiday.isRecurring) {
          const [, holidayMonth, holidayDay] = holiday.date.split('-');
          return holidayMonth === month && holidayDay === dateOfMonth;
        }
        return holiday.date === dateKey;
      });

      if (!isAttendanceHoliday) {
        leaveDays += 1;
      }
    }

    return leaveDays;
  }

  private async validateNoOverlap(
    companyId: number,
    employeeId: number,
    startDate: string,
    endDate: string,
    ignoreRequestId?: number,
  ): Promise<void> {
    const qb = this.leaveRequestRepository
      .createQueryBuilder('leaveRequest')
      .where('leaveRequest.company_id = :companyId', { companyId })
      .andWhere('leaveRequest.employee_id = :employeeId', { employeeId })
      .andWhere('leaveRequest.status IN (:...statuses)', {
        statuses: [
          LeaveStatusEnum.SUBMITTED,
          LeaveStatusEnum.IN_REVIEW,
          LeaveStatusEnum.APPROVED,
        ],
      })
      .andWhere('leaveRequest.start_date <= :endDate', { endDate })
      .andWhere('leaveRequest.end_date >= :startDate', { startDate });

    if (ignoreRequestId) {
      qb.andWhere('leaveRequest.id != :ignoreRequestId', { ignoreRequestId });
    }

    const overlap = await qb.getOne();
    if (overlap) {
      throw new ConflictException(
        `Leave request overlaps with existing request ${overlap.leave_no}`,
      );
    }
  }

  private calculateServiceMonths(hireDate?: string | null): number {
    if (!hireDate) {
      return 0;
    }
    const hire = new Date(`${hireDate}T00:00:00.000Z`);
    const today = new Date();

    let months =
      (today.getUTCFullYear() - hire.getUTCFullYear()) * 12 +
      (today.getUTCMonth() - hire.getUTCMonth());
    if (today.getUTCDate() < hire.getUTCDate()) {
      months -= 1;
    }
    return Math.max(0, months);
  }

  private async resolvePolicyContext(
    companyId: number,
    employee: Employee,
    leaveTypeId: number,
    manager?: EntityManager,
  ): Promise<PolicyContext> {
    const repository =
      manager?.getRepository(LeavePolicy) ?? this.leavePolicyRepository;
    const policies = await repository.find({
      where: {
        company_id: companyId,
        status: LeaveRecordStatusEnum.ACTIVE,
      },
      relations: {
        leave_types: true,
      },
    });

    let selected: {
      score: number;
      policy: LeavePolicy;
      policyType: LeavePolicyType;
    } | null = null;

    for (const policy of policies) {
      const policyType = policy.leave_types.find(
        (entry) => entry.leave_type_id === leaveTypeId,
      );
      if (!policyType) {
        continue;
      }

      let score = 0;
      const departmentMatched =
        policy.applicable_department_id !== null &&
        policy.applicable_department_id === employee.primary_department_id;
      const positionMatched =
        policy.applicable_position_id !== null &&
        policy.applicable_position_id === employee.primary_position_id;

      if (departmentMatched && positionMatched) score = 4;
      else if (positionMatched) score = 3;
      else if (departmentMatched) score = 2;
      else if (
        policy.applicable_department_id === null &&
        policy.applicable_position_id === null
      )
        score = 1;

      if (!score) {
        continue;
      }

      if (!selected || score > selected.score) {
        selected = { score, policy, policyType };
      }
    }

    if (!selected) {
      return {
        allowNegativeBalance: false,
        maxConsecutiveDays: null,
        minServiceMonths: 0,
        requiresApproval: true,
        maxPerRequestDays: null,
      };
    }

    return {
      allowNegativeBalance: selected.policy.allow_negative_balance,
      maxConsecutiveDays: selected.policy.max_consecutive_days,
      minServiceMonths: selected.policy.min_service_months,
      requiresApproval: selected.policyType.requires_approval,
      maxPerRequestDays: this.leaveBalanceService.toNumber(
        selected.policyType.max_per_request_days,
      )
        ? this.leaveBalanceService.toNumber(
            selected.policyType.max_per_request_days,
          )
        : null,
    };
  }

  private getAttendanceRecalculationJobRepository(
    manager?: EntityManager,
  ): Repository<AttendanceRecalculationJob> {
    return (
      manager?.getRepository(AttendanceRecalculationJob) ??
      this.attendanceRecalculationJobRepository
    );
  }

  private async queueAttendanceRecalculationForLeaveWindow(
    companyId: number,
    employeeId: number,
    startDate: string,
    endDate: string,
    reason: string,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<void> {
    await this.getAttendanceRecalculationJobRepository(manager).save(
      this.getAttendanceRecalculationJobRepository(manager).create({
        companyId,
        employeeId,
        dateFrom: startDate,
        dateTo: endDate,
        reason,
        status: AttendanceProcessingJobStatusEnum.PENDING,
        attempts: 0,
        requestedByCompanyUserId: actor.companyMembershipId ?? null,
        metadata: {
          source: 'leave',
        },
      }),
    );
  }

  private async submitLeaveRequestRecord(
    companyId: number,
    leaveRequest: LeaveRequest,
    employee: Employee,
    policyContext: PolicyContext,
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    const repository = manager.getRepository(LeaveRequest);
    const totalDays = this.leaveBalanceService.toNumber(
      leaveRequest.total_days,
    );
    const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
      leaveRequest.start_date,
    );
    const balance = await this.leaveBalanceService.ensureBalanceForEmployee(
      companyId,
      employee,
      leaveRequest.leave_type_id,
      fiscalYear,
      manager,
    );

    await this.leaveBalanceService.reserveDays(
      balance,
      totalDays,
      policyContext.allowNegativeBalance,
      manager,
    );

    leaveRequest.status = LeaveStatusEnum.SUBMITTED;
    leaveRequest.current_approval_level = 0;
    leaveRequest.applied_at = new Date();
    leaveRequest.rejection_reason = null;
    leaveRequest.cancelled_at = null;
    leaveRequest.approved_at = null;
    await repository.save(leaveRequest);

    if (policyContext.requiresApproval) {
      await this.leaveWorkflowService.initializeWorkflowForRequest(
        companyId,
        leaveRequest,
        manager,
      );
      return;
    }

    leaveRequest.status = LeaveStatusEnum.APPROVED;
    leaveRequest.approved_at = new Date();
    leaveRequest.current_approval_level = 0;
    await repository.save(leaveRequest);
    await this.leaveBalanceService.consumeReservedDays(
      balance,
      totalDays,
      manager,
    );
    await this.queueAttendanceRecalculationForLeaveWindow(
      companyId,
      employee.id,
      leaveRequest.start_date,
      leaveRequest.end_date,
      'Leave request auto-approved',
      actor,
      manager,
    );
  }

  private mapLeaveType(entity: LeaveType) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      name: entity.name,
      code: entity.code,
      description: entity.description,
      is_paid: entity.is_paid,
      requires_attachment: entity.requires_attachment,
      is_carry_forward_allowed: entity.is_carry_forward_allowed,
      max_carry_forward_days: entity.max_carry_forward_days,
      max_days_per_year: entity.max_days_per_year,
      gender_restriction: entity.gender_restriction,
      status: entity.status,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }

  private mapLeavePolicy(entity: LeavePolicy) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      name: entity.name,
      description: entity.description,
      applicable_department_id: entity.applicable_department_id,
      applicable_position_id: entity.applicable_position_id,
      accrual_method: entity.accrual_method,
      accrual_rate: entity.accrual_rate,
      max_consecutive_days: entity.max_consecutive_days,
      min_service_months: entity.min_service_months,
      allow_negative_balance: entity.allow_negative_balance,
      status: entity.status,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      leave_types:
        entity.leave_types?.map((entry) => ({
          id: entry.id,
          leave_type_id: entry.leave_type_id,
          annual_quota_days: entry.annual_quota_days,
          max_per_request_days: entry.max_per_request_days,
          requires_approval: entry.requires_approval,
        })) ?? [],
    };
  }

  private mapLeaveWorkflow(entity: LeaveApprovalWorkflow) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      name: entity.name,
      leave_type_id: entity.leave_type_id,
      is_default: entity.is_default,
      status: entity.status,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      steps: entity.steps?.map((step) => this.mapLeaveWorkflowStep(step)) ?? [],
    };
  }

  private mapLeaveWorkflowStep(entity: LeaveApprovalWorkflowStep) {
    return {
      id: entity.id,
      workflow_id: entity.workflow_id,
      approval_level: entity.approval_level,
      assigned_branch_id: entity.assigned_branch_id,
      assigned_department_id: entity.assigned_department_id,
      approver_type: entity.approver_type,
      role_id: entity.role_id,
      position_id: entity.position_id,
      company_user_id: entity.company_user_id,
      action_type: entity.action_type,
      is_required: entity.is_required,
      created_at: entity.created_at,
    };
  }

  private mapLeaveBalance(entity: LeaveBalance) {
    return {
      id: entity.id,
      employee_id: entity.employee_id,
      leave_type_id: entity.leave_type_id,
      fiscal_year: entity.fiscal_year,
      allocated_days: entity.allocated_days,
      used_days: entity.used_days,
      pending_days: entity.pending_days,
      carried_forward_days: entity.carried_forward_days,
      expired_days: entity.expired_days,
      available_days: this.leaveBalanceService
        .calculateAvailableDays(entity)
        .toFixed(2),
      updated_at: entity.updated_at,
    };
  }

  private mapLeaveRequest(entity: LeaveRequest) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      employee_id: entity.employee_id,
      leave_type_id: entity.leave_type_id,
      leave_no: entity.leave_no,
      start_date: entity.start_date,
      end_date: entity.end_date,
      total_days: entity.total_days,
      reason: entity.reason,
      current_approval_level: entity.current_approval_level,
      status: entity.status,
      rejection_reason: entity.rejection_reason,
      applied_at: entity.applied_at,
      approved_at: entity.approved_at,
      cancelled_at: entity.cancelled_at,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      employee: entity.employee
        ? {
            id: entity.employee.id,
            employee_no: entity.employee.employee_no,
            first_name: entity.employee.first_name,
            last_name: entity.employee.last_name,
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
      leave_type: entity.leave_type
        ? {
            id: entity.leave_type.id,
            name: entity.leave_type.name,
            code: entity.leave_type.code,
          }
        : null,
      approvals:
        entity.approvals?.map((approval) => ({
          id: approval.id,
          workflow_step_id: approval.workflow_step_id,
          approval_level: approval.approval_level,
          approver_company_user_id: approval.approver_company_user_id,
          status: approval.status,
          comments: approval.comments,
          signature_url: approval.signature_url,
          acted_at: approval.acted_at,
          approver: approval.approver?.user
            ? {
                id: approval.approver.user.id,
                first_name: approval.approver.user.first_name,
                last_name: approval.approver.user.last_name,
                email: approval.approver.user.email,
              }
            : null,
          workflow_step: approval.workflow_step
            ? {
                id: approval.workflow_step.id,
                action_type: approval.workflow_step.action_type,
                approver_type: approval.workflow_step.approver_type,
              }
            : null,
        })) ?? [],
      medical_detail: entity.medical_detail
        ? {
            id: entity.medical_detail.id,
            sickness_nature: entity.medical_detail.sickness_nature,
            doctor_name: entity.medical_detail.doctor_name,
            doctor_phone: entity.medical_detail.doctor_phone,
            hospital_name: entity.medical_detail.hospital_name,
            treatment_start_date: entity.medical_detail.treatment_start_date,
            treatment_end_date: entity.medical_detail.treatment_end_date,
            attachment_url: entity.medical_detail.attachment_url,
          }
        : null,
      documents:
        entity.documents?.map((document) => ({
          id: document.id,
          file_url: document.file_url,
          file_name: document.file_name,
          file_type: document.file_type,
          uploaded_at: document.uploaded_at,
          uploaded_by: document.uploaded_by?.user
            ? {
                id: document.uploaded_by.user.id,
                first_name: document.uploaded_by.user.first_name,
                last_name: document.uploaded_by.user.last_name,
              }
            : null,
        })) ?? [],
    };
  }

  async createLeaveType(
    companyId: number,
    dto: CreateLeaveTypeDto,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.leaveTypeRepository.findOne({
      where: { company_id: companyId, code: dto.code.trim() },
    });
    if (existing) {
      throw new ConflictException(
        'Leave type code already exists in this company',
      );
    }

    const leaveType = await this.leaveTypeRepository.save(
      this.leaveTypeRepository.create({
        company_id: companyId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        description: this.normalizeOptionalString(dto.description),
        is_paid: dto.is_paid ?? true,
        requires_attachment: dto.requires_attachment ?? false,
        is_carry_forward_allowed: dto.is_carry_forward_allowed ?? false,
        max_carry_forward_days: this.leaveBalanceService.toDecimal(
          dto.max_carry_forward_days ?? 0,
        ),
        max_days_per_year: this.leaveBalanceService.toDecimal(
          dto.max_days_per_year ?? 0,
        ),
        gender_restriction:
          dto.gender_restriction ?? LeaveGenderRestrictionEnum.ANY,
        status: dto.status ?? LeaveRecordStatusEnum.ACTIVE,
      }),
    );

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_type.created',
      entity_name: 'leave_type',
      entity_id: leaveType.id,
      actor,
      payload: this.mapLeaveType(leaveType),
    });

    return this.mapLeaveType(leaveType);
  }

  async findAllLeaveTypes(companyId: number, query: LeaveTypeQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
    } = query;
    const qb = this.leaveTypeRepository
      .createQueryBuilder('leaveType')
      .where('leaveType.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('leaveType.status = :status', { status: status.trim() });
    }
    if (search?.trim()) {
      qb.andWhere('(leaveType.name LIKE :term OR leaveType.code LIKE :term)', {
        term: `%${search.trim()}%`,
      });
    }

    const allowedSortFields = [
      'id',
      'name',
      'code',
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
      .orderBy(`leaveType.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapLeaveType(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneLeaveType(companyId: number, leaveTypeId: number) {
    return this.mapLeaveType(
      await this.findLeaveTypeOrFail(companyId, leaveTypeId),
    );
  }

  async updateLeaveType(
    companyId: number,
    leaveTypeId: number,
    dto: UpdateLeaveTypeDto,
    actor: AuthenticatedUser,
  ) {
    const leaveType = await this.findLeaveTypeOrFail(companyId, leaveTypeId);

    if (
      dto.code !== undefined &&
      dto.code.trim().toUpperCase() !== leaveType.code
    ) {
      const existing = await this.leaveTypeRepository.findOne({
        where: { company_id: companyId, code: dto.code.trim().toUpperCase() },
      });
      if (existing && existing.id !== leaveType.id) {
        throw new ConflictException(
          'Leave type code already exists in this company',
        );
      }
    }

    if (dto.name !== undefined) leaveType.name = dto.name.trim();
    if (dto.code !== undefined) leaveType.code = dto.code.trim().toUpperCase();
    if (dto.description !== undefined) {
      leaveType.description = this.normalizeOptionalString(dto.description);
    }
    if (dto.is_paid !== undefined) leaveType.is_paid = dto.is_paid;
    if (dto.requires_attachment !== undefined) {
      leaveType.requires_attachment = dto.requires_attachment;
    }
    if (dto.is_carry_forward_allowed !== undefined) {
      leaveType.is_carry_forward_allowed = dto.is_carry_forward_allowed;
    }
    if (dto.max_carry_forward_days !== undefined) {
      leaveType.max_carry_forward_days = this.leaveBalanceService.toDecimal(
        dto.max_carry_forward_days,
      );
    }
    if (dto.max_days_per_year !== undefined) {
      leaveType.max_days_per_year = this.leaveBalanceService.toDecimal(
        dto.max_days_per_year,
      );
    }
    if (dto.gender_restriction !== undefined) {
      leaveType.gender_restriction = dto.gender_restriction;
    }
    if (dto.status !== undefined) leaveType.status = dto.status;

    const saved = await this.leaveTypeRepository.save(leaveType);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_type.updated',
      entity_name: 'leave_type',
      entity_id: saved.id,
      actor,
      payload: this.mapLeaveType(saved),
    });

    return this.mapLeaveType(saved);
  }

  async removeLeaveType(
    companyId: number,
    leaveTypeId: number,
    actor: AuthenticatedUser,
  ) {
    const leaveType = await this.findLeaveTypeOrFail(companyId, leaveTypeId);
    await this.leaveTypeRepository.remove(leaveType);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_type.deleted',
      entity_name: 'leave_type',
      entity_id: leaveTypeId,
      actor,
    });
    return { message: 'Leave type deleted successfully' };
  }

  private async validatePolicyReferences(
    companyId: number,
    values: {
      applicable_department_id?: number;
      applicable_position_id?: number;
    },
  ): Promise<void> {
    if (values.applicable_department_id !== undefined) {
      if (!values.applicable_department_id) {
        return;
      }
      const department = await this.departmentRepository.findOne({
        where: { id: values.applicable_department_id, company_id: companyId },
      });
      if (!department) {
        throw new NotFoundException('Applicable department not found');
      }
    }

    if (values.applicable_position_id !== undefined) {
      if (!values.applicable_position_id) {
        return;
      }
      const position = await this.positionRepository.findOne({
        where: { id: values.applicable_position_id, company_id: companyId },
      });
      if (!position) {
        throw new NotFoundException('Applicable position not found');
      }
    }
  }

  private async syncPolicyTypes(
    manager: EntityManager,
    policyId: number,
    companyId: number,
    entries: CreateLeavePolicyDto['leave_types'],
  ): Promise<void> {
    const leaveTypeIds = entries.map((entry) => entry.leave_type_id);
    const leaveTypes = await manager.getRepository(LeaveType).find({
      where: { id: In(leaveTypeIds), company_id: companyId },
      select: ['id'],
    });

    if (leaveTypes.length !== leaveTypeIds.length) {
      throw new NotFoundException(
        'One or more leave types are invalid for this policy',
      );
    }

    await manager
      .getRepository(LeavePolicyType)
      .delete({ policy_id: policyId });
    await manager.getRepository(LeavePolicyType).save(
      entries.map((entry) =>
        manager.getRepository(LeavePolicyType).create({
          policy_id: policyId,
          leave_type_id: entry.leave_type_id,
          annual_quota_days: this.leaveBalanceService.toDecimal(
            entry.annual_quota_days,
          ),
          max_per_request_days:
            entry.max_per_request_days !== undefined
              ? this.leaveBalanceService.toDecimal(entry.max_per_request_days)
              : null,
          requires_approval: entry.requires_approval ?? true,
        }),
      ),
    );
  }

  async createLeavePolicy(
    companyId: number,
    dto: CreateLeavePolicyDto,
    actor: AuthenticatedUser,
  ) {
    await this.validatePolicyReferences(companyId, dto);

    const created = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeavePolicy);
      const policy = await repository.save(
        repository.create({
          company_id: companyId,
          name: dto.name.trim(),
          description: this.normalizeOptionalString(dto.description),
          applicable_department_id: dto.applicable_department_id ?? null,
          applicable_position_id: dto.applicable_position_id ?? null,
          accrual_method: dto.accrual_method ?? LeaveAccrualMethodEnum.YEARLY,
          accrual_rate:
            dto.accrual_rate !== undefined
              ? this.leaveBalanceService.toDecimal(dto.accrual_rate)
              : null,
          max_consecutive_days: dto.max_consecutive_days ?? null,
          min_service_months: dto.min_service_months ?? 0,
          allow_negative_balance: dto.allow_negative_balance ?? false,
          status: dto.status ?? LeaveRecordStatusEnum.ACTIVE,
        }),
      );
      await this.syncPolicyTypes(
        manager,
        policy.id,
        companyId,
        dto.leave_types,
      );

      return repository.findOneOrFail({
        where: { id: policy.id },
        relations: { leave_types: true },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.created',
      entity_name: 'leave_policy',
      entity_id: created.id,
      actor,
      payload: this.mapLeavePolicy(created),
    });

    return this.mapLeavePolicy(created);
  }

  async findAllLeavePolicies(companyId: number, query: LeavePolicyQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
      applicable_department_id,
      applicable_position_id,
    } = query;

    const qb = this.leavePolicyRepository
      .createQueryBuilder('leavePolicy')
      .leftJoinAndSelect('leavePolicy.leave_types', 'leaveTypes')
      .where('leavePolicy.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('leavePolicy.status = :status', { status: status.trim() });
    }
    if (typeof applicable_department_id === 'number') {
      qb.andWhere('leavePolicy.applicable_department_id = :departmentId', {
        departmentId: applicable_department_id,
      });
    }
    if (typeof applicable_position_id === 'number') {
      qb.andWhere('leavePolicy.applicable_position_id = :positionId', {
        positionId: applicable_position_id,
      });
    }
    if (search?.trim()) {
      qb.andWhere(
        '(leavePolicy.name LIKE :term OR leavePolicy.description LIKE :term)',
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
      .orderBy(`leavePolicy.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapLeavePolicy(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneLeavePolicy(companyId: number, policyId: number) {
    const policy = await this.leavePolicyRepository.findOne({
      where: { id: policyId, company_id: companyId },
      relations: { leave_types: true },
    });
    if (!policy) {
      throw new NotFoundException('Leave policy not found');
    }
    return this.mapLeavePolicy(policy);
  }

  async updateLeavePolicy(
    companyId: number,
    policyId: number,
    dto: UpdateLeavePolicyDto,
    actor: AuthenticatedUser,
  ) {
    await this.validatePolicyReferences(companyId, dto);

    const updated = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeavePolicy);
      const policy = await repository.findOne({
        where: { id: policyId, company_id: companyId },
      });
      if (!policy) {
        throw new NotFoundException('Leave policy not found');
      }

      if (dto.name !== undefined) policy.name = dto.name.trim();
      if (dto.description !== undefined) {
        policy.description = this.normalizeOptionalString(dto.description);
      }
      if (dto.applicable_department_id !== undefined) {
        policy.applicable_department_id = dto.applicable_department_id ?? null;
      }
      if (dto.applicable_position_id !== undefined) {
        policy.applicable_position_id = dto.applicable_position_id ?? null;
      }
      if (dto.accrual_method !== undefined)
        policy.accrual_method = dto.accrual_method;
      if (dto.accrual_rate !== undefined) {
        policy.accrual_rate =
          dto.accrual_rate === null
            ? null
            : this.leaveBalanceService.toDecimal(dto.accrual_rate);
      }
      if (dto.max_consecutive_days !== undefined) {
        policy.max_consecutive_days = dto.max_consecutive_days ?? null;
      }
      if (dto.min_service_months !== undefined) {
        policy.min_service_months = dto.min_service_months;
      }
      if (dto.allow_negative_balance !== undefined) {
        policy.allow_negative_balance = dto.allow_negative_balance;
      }
      if (dto.status !== undefined) policy.status = dto.status;

      await repository.save(policy);
      if (dto.leave_types) {
        await this.syncPolicyTypes(
          manager,
          policy.id,
          companyId,
          dto.leave_types,
        );
      }

      return repository.findOneOrFail({
        where: { id: policy.id },
        relations: { leave_types: true },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.updated',
      entity_name: 'leave_policy',
      entity_id: updated.id,
      actor,
      payload: this.mapLeavePolicy(updated),
    });

    return this.mapLeavePolicy(updated);
  }

  async removeLeavePolicy(
    companyId: number,
    policyId: number,
    actor: AuthenticatedUser,
  ) {
    const policy = await this.leavePolicyRepository.findOne({
      where: { id: policyId, company_id: companyId },
    });
    if (!policy) {
      throw new NotFoundException('Leave policy not found');
    }

    await this.leavePolicyRepository.remove(policy);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_policy.deleted',
      entity_name: 'leave_policy',
      entity_id: policyId,
      actor,
    });
    return { message: 'Leave policy deleted successfully' };
  }

  private validateWorkflowSteps(
    dto: CreateLeaveWorkflowDto | UpdateLeaveWorkflowDto,
  ): void {
    if (!dto.steps) {
      return;
    }
    const levels = dto.steps.map((step) => step.approval_level);
    const unique = new Set(levels);
    if (unique.size !== levels.length) {
      throw new BadRequestException('Workflow approval levels must be unique');
    }
  }

  private async findLeaveWorkflowOrFail(
    companyId: number,
    workflowId: number,
    manager?: EntityManager,
  ): Promise<LeaveApprovalWorkflow> {
    const repository =
      manager?.getRepository(LeaveApprovalWorkflow) ??
      this.leaveApprovalWorkflowRepository;
    const workflow = await repository.findOne({
      where: { id: workflowId, company_id: companyId },
    });

    if (!workflow) {
      throw new NotFoundException('Leave workflow not found');
    }

    return workflow;
  }

  private async findLeaveWorkflowStepOrFail(
    workflowId: number,
    stepId: number,
    manager?: EntityManager,
  ): Promise<LeaveApprovalWorkflowStep> {
    const repository =
      manager?.getRepository(LeaveApprovalWorkflowStep) ??
      this.leaveApprovalWorkflowStepRepository;
    const step = await repository.findOne({
      where: {
        id: stepId,
        workflow_id: workflowId,
      },
    });

    if (!step) {
      throw new NotFoundException('Leave workflow step not found');
    }

    return step;
  }

  private async ensureWorkflowLevelIsUnique(
    workflowId: number,
    approvalLevel: number,
    exceptStepId?: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository =
      manager?.getRepository(LeaveApprovalWorkflowStep) ??
      this.leaveApprovalWorkflowStepRepository;
    const existing = await repository.findOne({
      where: {
        workflow_id: workflowId,
        approval_level: approvalLevel,
      },
      select: ['id'],
    });

    if (existing && existing.id !== exceptStepId) {
      throw new ConflictException(
        `Approval level ${approvalLevel} already exists in this workflow`,
      );
    }
  }

  private async validateWorkflowStepReferences(
    companyId: number,
    step: {
      assigned_branch_id?: number | null;
      assigned_department_id?: number | null;
      role_id?: number | null;
      position_id?: number | null;
      company_user_id?: number | null;
    },
  ): Promise<void> {
    if (step.assigned_branch_id) {
      const branch = await this.branchRepository.findOne({
        where: {
          id: step.assigned_branch_id,
          company_id: companyId,
        },
      });
      if (!branch) {
        throw new NotFoundException(
          `Branch ${step.assigned_branch_id} is not available in this company`,
        );
      }
    }

    if (step.assigned_department_id) {
      const department = await this.departmentRepository.findOne({
        where: {
          id: step.assigned_department_id,
          company_id: companyId,
        },
      });
      if (!department) {
        throw new NotFoundException(
          `Department ${step.assigned_department_id} is not available in this company`,
        );
      }

      if (
        step.assigned_branch_id &&
        department.branch_id &&
        department.branch_id !== step.assigned_branch_id
      ) {
        throw new BadRequestException(
          `Department ${step.assigned_department_id} does not belong to branch ${step.assigned_branch_id}`,
        );
      }
    }

    if (step.role_id) {
      const role = await this.roleRepository.findOne({
        where: {
          id: step.role_id,
          company_id: companyId,
        },
      });
      if (!role) {
        throw new NotFoundException(
          `Role ${step.role_id} is not available in this company`,
        );
      }
    }

    if (step.position_id) {
      const position = await this.positionRepository.findOne({
        where: { id: step.position_id, company_id: companyId },
      });
      if (!position) {
        throw new NotFoundException(
          `Position ${step.position_id} is not available in this company`,
        );
      }

      if (
        step.assigned_branch_id &&
        position.branch_id &&
        position.branch_id !== step.assigned_branch_id
      ) {
        throw new BadRequestException(
          `Position ${step.position_id} does not belong to branch ${step.assigned_branch_id}`,
        );
      }

      if (
        step.assigned_department_id &&
        position.department_id &&
        position.department_id !== step.assigned_department_id
      ) {
        throw new BadRequestException(
          `Position ${step.position_id} does not belong to department ${step.assigned_department_id}`,
        );
      }
    }

    if (step.company_user_id) {
      const membership = await this.companyUserRepository.findOne({
        where: {
          id: step.company_user_id,
          company_id: companyId,
        },
      });
      if (!membership) {
        throw new NotFoundException(
          `Company user ${step.company_user_id} is not available in this company`,
        );
      }
    }
  }

  private async validateWorkflowReferences(
    companyId: number,
    dto: CreateLeaveWorkflowDto | UpdateLeaveWorkflowDto,
  ): Promise<void> {
    if (dto.leave_type_id !== undefined && dto.leave_type_id !== null) {
      await this.findLeaveTypeOrFail(companyId, dto.leave_type_id);
    }

    for (const step of dto.steps ?? []) {
      await this.validateWorkflowStepReferences(companyId, step);
    }
  }

  async createLeaveWorkflow(
    companyId: number,
    dto: CreateLeaveWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    this.validateWorkflowSteps(dto);
    await this.validateWorkflowReferences(companyId, dto);

    const created = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = manager.getRepository(LeaveApprovalWorkflow);
      const stepRepository = manager.getRepository(LeaveApprovalWorkflowStep);

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
          leave_type_id: dto.leave_type_id ?? null,
          is_default: dto.is_default ?? false,
          status: dto.status ?? LeaveRecordStatusEnum.ACTIVE,
        }),
      );

      await stepRepository.save(
        dto.steps.map((step) =>
          stepRepository.create({
            workflow_id: workflow.id,
            approval_level: step.approval_level,
            assigned_branch_id: step.assigned_branch_id ?? null,
            assigned_department_id: step.assigned_department_id ?? null,
            approver_type: step.approver_type,
            role_id: step.role_id ?? null,
            position_id: step.position_id ?? null,
            company_user_id: step.company_user_id ?? null,
            action_type: step.action_type,
            is_required: step.is_required ?? true,
          }),
        ),
      );

      return workflowRepository.findOneOrFail({
        where: { id: workflow.id },
        relations: { steps: true },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow.created',
      entity_name: 'leave_workflow',
      entity_id: created.id,
      actor,
      payload: this.mapLeaveWorkflow(created),
    });

    return this.mapLeaveWorkflow(created);
  }

  async findAllLeaveWorkflows(companyId: number, query: LeaveWorkflowQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
      leave_type_id,
    } = query;

    const qb = this.leaveApprovalWorkflowRepository
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.steps', 'steps')
      .where('workflow.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('workflow.status = :status', { status: status.trim() });
    }
    if (typeof leave_type_id === 'number') {
      qb.andWhere('workflow.leave_type_id = :leaveTypeId', {
        leaveTypeId: leave_type_id,
      });
    }
    if (search?.trim()) {
      qb.andWhere('workflow.name LIKE :term', { term: `%${search.trim()}%` });
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
      .addOrderBy('steps.approval_level', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapLeaveWorkflow(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneLeaveWorkflow(companyId: number, workflowId: number) {
    const workflow = await this.leaveApprovalWorkflowRepository.findOne({
      where: { id: workflowId, company_id: companyId },
      relations: { steps: true },
    });
    if (!workflow) {
      throw new NotFoundException('Leave workflow not found');
    }
    return this.mapLeaveWorkflow(workflow);
  }

  async updateLeaveWorkflow(
    companyId: number,
    workflowId: number,
    dto: UpdateLeaveWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    this.validateWorkflowSteps(dto);
    await this.validateWorkflowReferences(companyId, dto);

    const updated = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = manager.getRepository(LeaveApprovalWorkflow);
      const stepRepository = manager.getRepository(LeaveApprovalWorkflowStep);

      const workflow = await workflowRepository.findOne({
        where: { id: workflowId, company_id: companyId },
      });
      if (!workflow) {
        throw new NotFoundException('Leave workflow not found');
      }

      if (dto.is_default) {
        await workflowRepository.update(
          { company_id: companyId, is_default: true },
          { is_default: false },
        );
      }

      if (dto.name !== undefined) workflow.name = dto.name.trim();
      if (dto.leave_type_id !== undefined) {
        workflow.leave_type_id = dto.leave_type_id ?? null;
      }
      if (dto.is_default !== undefined) workflow.is_default = dto.is_default;
      if (dto.status !== undefined) workflow.status = dto.status;

      await workflowRepository.save(workflow);

      if (dto.steps) {
        await stepRepository.delete({ workflow_id: workflow.id });
        await stepRepository.save(
          dto.steps.map((step) =>
            stepRepository.create({
              workflow_id: workflow.id,
              approval_level: step.approval_level,
              assigned_branch_id: step.assigned_branch_id ?? null,
              assigned_department_id: step.assigned_department_id ?? null,
              approver_type: step.approver_type,
              role_id: step.role_id ?? null,
              position_id: step.position_id ?? null,
              company_user_id: step.company_user_id ?? null,
              action_type: step.action_type,
              is_required: step.is_required ?? true,
            }),
          ),
        );
      }

      return workflowRepository.findOneOrFail({
        where: { id: workflow.id },
        relations: { steps: true },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow.updated',
      entity_name: 'leave_workflow',
      entity_id: updated.id,
      actor,
      payload: this.mapLeaveWorkflow(updated),
    });

    return this.mapLeaveWorkflow(updated);
  }

  async removeLeaveWorkflow(
    companyId: number,
    workflowId: number,
    actor: AuthenticatedUser,
  ) {
    const workflow = await this.leaveApprovalWorkflowRepository.findOne({
      where: { id: workflowId, company_id: companyId },
    });
    if (!workflow) {
      throw new NotFoundException('Leave workflow not found');
    }

    await this.leaveApprovalWorkflowRepository.remove(workflow);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow.deleted',
      entity_name: 'leave_workflow',
      entity_id: workflowId,
      actor,
    });
    return { message: 'Leave workflow deleted successfully' };
  }

  async createLeaveWorkflowStep(
    companyId: number,
    workflowId: number,
    dto: CreateLeaveWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    await this.findLeaveWorkflowOrFail(companyId, workflowId);

    const approverType = dto.approver_type;
    const stepPayload = {
      assigned_branch_id: dto.assigned_branch_id ?? null,
      assigned_department_id: dto.assigned_department_id ?? null,
      role_id:
        approverType === LeaveApproverTypeEnum.ROLE
          ? (dto.role_id ?? null)
          : null,
      position_id:
        approverType === LeaveApproverTypeEnum.POSITION
          ? (dto.position_id ?? null)
          : null,
      company_user_id:
        approverType === LeaveApproverTypeEnum.COMPANY_USER
          ? (dto.company_user_id ?? null)
          : null,
    };

    await this.validateWorkflowStepReferences(companyId, stepPayload);
    await this.ensureWorkflowLevelIsUnique(workflowId, dto.approval_level);

    const created = await this.dataSource.transaction(async (manager) => {
      await this.findLeaveWorkflowOrFail(companyId, workflowId, manager);
      await this.ensureWorkflowLevelIsUnique(
        workflowId,
        dto.approval_level,
        undefined,
        manager,
      );

      const repository = manager.getRepository(LeaveApprovalWorkflowStep);
      return repository.save(
        repository.create({
          workflow_id: workflowId,
          approval_level: dto.approval_level,
          assigned_branch_id: stepPayload.assigned_branch_id,
          assigned_department_id: stepPayload.assigned_department_id,
          approver_type: dto.approver_type,
          role_id: stepPayload.role_id,
          position_id: stepPayload.position_id,
          company_user_id: stepPayload.company_user_id,
          action_type: dto.action_type,
          is_required: dto.is_required ?? true,
        }),
      );
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow_step.created',
      entity_name: 'leave_workflow_step',
      entity_id: created.id,
      actor,
      payload: this.mapLeaveWorkflowStep(created),
    });

    return this.mapLeaveWorkflowStep(created);
  }

  async findAllLeaveWorkflowSteps(companyId: number, workflowId: number) {
    await this.findLeaveWorkflowOrFail(companyId, workflowId);
    const steps = await this.leaveApprovalWorkflowStepRepository.find({
      where: { workflow_id: workflowId },
      order: { approval_level: 'ASC', id: 'ASC' },
    });

    return {
      data: steps.map((step) => this.mapLeaveWorkflowStep(step)),
    };
  }

  async findOneLeaveWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
  ) {
    await this.findLeaveWorkflowOrFail(companyId, workflowId);
    const step = await this.findLeaveWorkflowStepOrFail(workflowId, stepId);
    return this.mapLeaveWorkflowStep(step);
  }

  async updateLeaveWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    dto: UpdateLeaveWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    await this.findLeaveWorkflowOrFail(companyId, workflowId);
    const existing = await this.findLeaveWorkflowStepOrFail(workflowId, stepId);

    const nextApproverType = dto.approver_type ?? existing.approver_type;
    const nextPayload = {
      assigned_branch_id:
        dto.assigned_branch_id !== undefined
          ? (dto.assigned_branch_id ?? null)
          : existing.assigned_branch_id,
      assigned_department_id:
        dto.assigned_department_id !== undefined
          ? (dto.assigned_department_id ?? null)
          : existing.assigned_department_id,
      role_id:
        nextApproverType === LeaveApproverTypeEnum.ROLE
          ? dto.role_id !== undefined
            ? (dto.role_id ?? null)
            : dto.approver_type !== undefined
              ? null
              : existing.role_id
          : null,
      position_id:
        nextApproverType === LeaveApproverTypeEnum.POSITION
          ? dto.position_id !== undefined
            ? (dto.position_id ?? null)
            : dto.approver_type !== undefined
              ? null
              : existing.position_id
          : null,
      company_user_id:
        nextApproverType === LeaveApproverTypeEnum.COMPANY_USER
          ? dto.company_user_id !== undefined
            ? (dto.company_user_id ?? null)
            : dto.approver_type !== undefined
              ? null
              : existing.company_user_id
          : null,
    };

    if (dto.approval_level !== undefined) {
      await this.ensureWorkflowLevelIsUnique(
        workflowId,
        dto.approval_level,
        stepId,
      );
    }
    await this.validateWorkflowStepReferences(companyId, nextPayload);

    const updated = await this.dataSource.transaction(async (manager) => {
      await this.findLeaveWorkflowOrFail(companyId, workflowId, manager);
      const step = await this.findLeaveWorkflowStepOrFail(
        workflowId,
        stepId,
        manager,
      );

      if (dto.approval_level !== undefined) {
        await this.ensureWorkflowLevelIsUnique(
          workflowId,
          dto.approval_level,
          stepId,
          manager,
        );
        step.approval_level = dto.approval_level;
      }

      if (dto.assigned_branch_id !== undefined) {
        step.assigned_branch_id = nextPayload.assigned_branch_id;
      }
      if (dto.assigned_department_id !== undefined) {
        step.assigned_department_id = nextPayload.assigned_department_id;
      }
      if (dto.approver_type !== undefined) {
        step.approver_type = nextApproverType;
      }
      if (dto.action_type !== undefined) {
        step.action_type = dto.action_type;
      }
      if (dto.is_required !== undefined) {
        step.is_required = dto.is_required;
      }

      step.role_id = nextPayload.role_id;
      step.position_id = nextPayload.position_id;
      step.company_user_id = nextPayload.company_user_id;

      return manager.getRepository(LeaveApprovalWorkflowStep).save(step);
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow_step.updated',
      entity_name: 'leave_workflow_step',
      entity_id: updated.id,
      actor,
      payload: this.mapLeaveWorkflowStep(updated),
    });

    return this.mapLeaveWorkflowStep(updated);
  }

  async removeLeaveWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    actor: AuthenticatedUser,
  ) {
    await this.findLeaveWorkflowOrFail(companyId, workflowId);
    const step = await this.findLeaveWorkflowStepOrFail(workflowId, stepId);

    await this.leaveApprovalWorkflowStepRepository.remove(step);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_workflow_step.deleted',
      entity_name: 'leave_workflow_step',
      entity_id: step.id,
      actor,
      payload: this.mapLeaveWorkflowStep(step),
    });

    return { message: 'Leave workflow step deleted successfully' };
  }

  async createHoliday(
    companyId: number,
    dto: CreateHolidayDto,
    actor: AuthenticatedUser,
  ) {
    const holidayGroup = await this.ensureSharedHolidayGroup(companyId);

    const existing = await this.attendanceHolidayRepository.findOne({
      where: {
        companyId,
        branchId: IsNull(),
        name: dto.name.trim(),
        date: dto.holiday_date,
      },
    });
    if (existing) {
      throw new ConflictException('Holiday already exists');
    }

    const holiday = await this.attendanceHolidayRepository.save(
      this.attendanceHolidayRepository.create({
        companyId,
        holidayGroupId: holidayGroup.id,
        name: dto.name.trim(),
        date: dto.holiday_date,
        isRecurring: dto.is_recurring ?? false,
        type: AttendanceHolidayTypeEnum.COMPANY,
        isPaid: true,
        affectsOvertime: false,
        countsAsWorkingDay: false,
        branchId: null,
      }),
    );

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'holiday.created',
      entity_name: 'holiday',
      entity_id: holiday.id,
      actor,
    });

    return this.mapHolidayRecord(holiday);
  }

  async findAllHolidays(companyId: number, query: HolidayQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'holiday_date',
      sortOrder,
      from_date,
      to_date,
    } = query;

    const qb = this.attendanceHolidayRepository
      .createQueryBuilder('holiday')
      .where('holiday.company_id = :companyId', { companyId })
      .andWhere('holiday.branch_id IS NULL');

    if (from_date) {
      qb.andWhere('holiday.date >= :fromDate', { fromDate: from_date });
    }
    if (to_date) {
      qb.andWhere('holiday.date <= :toDate', { toDate: to_date });
    }

    const allowedSortFields = [
      'id',
      'name',
      'holiday_date',
      'created_at',
      'updated_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'holiday_date';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;
    const sortField =
      safeSortBy === 'holiday_date'
        ? 'date'
        : safeSortBy === 'updated_at'
          ? 'updated_at'
          : safeSortBy;

    const [items, total] = await qb
      .orderBy(`holiday.${sortField}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapHolidayRecord(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async updateHoliday(
    companyId: number,
    holidayId: number,
    dto: UpdateHolidayDto,
    actor: AuthenticatedUser,
  ) {
    const holiday = await this.attendanceHolidayRepository.findOne({
      where: { id: holidayId, companyId, branchId: IsNull() },
    });
    if (!holiday) {
      throw new NotFoundException('Holiday not found');
    }

    const nextName = dto.name?.trim() ?? holiday.name;
    const nextDate = dto.holiday_date ?? holiday.date;
    const duplicate = await this.attendanceHolidayRepository.findOne({
      where: {
        companyId,
        branchId: IsNull(),
        name: nextName,
        date: nextDate,
      },
    });
    if (duplicate && duplicate.id !== holiday.id) {
      throw new ConflictException('Holiday already exists');
    }

    holiday.name = nextName;
    holiday.date = nextDate;
    if (dto.is_recurring !== undefined) holiday.isRecurring = dto.is_recurring;

    const saved = await this.attendanceHolidayRepository.save(holiday);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'holiday.updated',
      entity_name: 'holiday',
      entity_id: saved.id,
      actor,
    });
    return this.mapHolidayRecord(saved);
  }

  async removeHoliday(
    companyId: number,
    holidayId: number,
    actor: AuthenticatedUser,
  ) {
    const holiday = await this.attendanceHolidayRepository.findOne({
      where: { id: holidayId, companyId, branchId: IsNull() },
    });
    if (!holiday) {
      throw new NotFoundException('Holiday not found');
    }

    await this.attendanceHolidayRepository.remove(holiday);
    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'holiday.deleted',
      entity_name: 'holiday',
      entity_id: holidayId,
      actor,
    });
    return { message: 'Holiday deleted successfully' };
  }

  async findAllLeaveBalances(
    companyId: number,
    query: LeaveBalanceQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'updated_at',
      sortOrder,
      employee_id,
      leave_type_id,
      fiscal_year,
    } = query;
    const scopedEmployeeId = await this.resolveScopedEmployeeId(
      companyId,
      employee_id,
      actor,
    );

    const qb = this.leaveBalanceRepository
      .createQueryBuilder('leaveBalance')
      .innerJoinAndSelect('leaveBalance.employee', 'employee')
      .innerJoinAndSelect('employee.company_user', 'membership')
      .innerJoinAndSelect('leaveBalance.leave_type', 'leaveType')
      .where('membership.company_id = :companyId', { companyId });

    if (typeof scopedEmployeeId === 'number') {
      qb.andWhere('leaveBalance.employee_id = :employeeId', {
        employeeId: scopedEmployeeId,
      });
    }
    if (typeof leave_type_id === 'number') {
      qb.andWhere('leaveBalance.leave_type_id = :leaveTypeId', {
        leaveTypeId: leave_type_id,
      });
    }
    if (fiscal_year?.trim()) {
      qb.andWhere('leaveBalance.fiscal_year = :fiscalYear', {
        fiscalYear: fiscal_year.trim(),
      });
    }

    const allowedSortFields = ['id', 'fiscal_year', 'updated_at', 'created_at'];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'updated_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`leaveBalance.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    if (typeof scopedEmployeeId === 'number') {
      await this.assertCanAccessEmployeeById(
        companyId,
        scopedEmployeeId,
        actor,
      );
    }

    return {
      data: items.map((item) => this.mapLeaveBalance(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async adjustLeaveBalance(
    companyId: number,
    dto: AdjustLeaveBalanceDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    await this.findLeaveTypeOrFail(companyId, dto.leave_type_id);

    const balance = await this.leaveBalanceService.ensureBalanceForEmployee(
      companyId,
      employee,
      dto.leave_type_id,
      dto.fiscal_year.trim(),
    );

    const updated = await this.leaveBalanceService.overwriteBalance(balance, {
      allocated_days: dto.allocated_days,
      carried_forward_days: dto.carried_forward_days ?? 0,
      expired_days: dto.expired_days ?? 0,
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      action: 'leave_balance.adjusted',
      entity_name: 'leave_balance',
      entity_id: updated.id,
      actor,
      payload: this.mapLeaveBalance(updated),
    });

    return this.mapLeaveBalance(updated);
  }

  async createLeaveRequest(
    companyId: number,
    dto: CreateLeaveRequestDto,
    actor: AuthenticatedUser,
  ) {
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    this.assertEmployeeCanRequestLeave(employee, dto.start_date, dto.end_date);
    const leaveType = await this.findLeaveTypeOrFail(
      companyId,
      dto.leave_type_id,
    );

    if (leaveType.status !== LeaveRecordStatusEnum.ACTIVE) {
      throw new BadRequestException('Leave type is inactive');
    }

    this.assertDateOrder(
      dto.start_date,
      dto.end_date,
      'end_date cannot be before start_date',
    );

    if (
      leaveType.gender_restriction !== 'any' &&
      employee.gender &&
      employee.gender.toLowerCase() !== leaveType.gender_restriction
    ) {
      throw new BadRequestException(
        `Leave type is restricted to ${leaveType.gender_restriction}`,
      );
    }

    const totalDays = await this.calculateLeaveDays(
      companyId,
      employee.primary_branch_id ?? null,
      dto.start_date,
      dto.end_date,
    );
    if (totalDays <= 0) {
      throw new BadRequestException(
        'Selected period results in zero leave days after holidays/weekends',
      );
    }

    await this.validateNoOverlap(
      companyId,
      dto.employee_id,
      dto.start_date,
      dto.end_date,
    );

    const policyContext = await this.resolvePolicyContext(
      companyId,
      employee,
      dto.leave_type_id,
    );

    if (
      policyContext.maxConsecutiveDays &&
      totalDays > policyContext.maxConsecutiveDays
    ) {
      throw new BadRequestException(
        `Leave exceeds maximum consecutive days (${policyContext.maxConsecutiveDays})`,
      );
    }

    if (
      policyContext.maxPerRequestDays &&
      totalDays > policyContext.maxPerRequestDays
    ) {
      throw new BadRequestException(
        `Leave exceeds maximum days per request (${policyContext.maxPerRequestDays})`,
      );
    }

    const serviceMonths = this.calculateServiceMonths(employee.hire_date);
    if (serviceMonths < policyContext.minServiceMonths) {
      throw new BadRequestException(
        `Employee requires minimum ${policyContext.minServiceMonths} month(s) of service`,
      );
    }

    const shouldSubmit = dto.submit ?? true;

    const leaveRequest = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRequest);
      const leaveNo = await this.generateLeaveNo(companyId, manager);
      const created = await repository.save(
        repository.create({
          company_id: companyId,
          employee_id: dto.employee_id,
          leave_type_id: dto.leave_type_id,
          leave_no: leaveNo,
          start_date: dto.start_date,
          end_date: dto.end_date,
          total_days: this.leaveBalanceService.toDecimal(totalDays),
          reason: dto.reason.trim(),
          current_approval_level: 0,
          status: LeaveStatusEnum.DRAFT,
          rejection_reason: null,
          applied_at: null,
          created_by_company_user_id: actor.companyMembershipId!,
        }),
      );

      if (shouldSubmit) {
        await this.submitLeaveRequestRecord(
          companyId,
          created,
          employee,
          policyContext,
          actor,
          manager,
        );
      }

      return repository.findOneOrFail({
        where: { id: created.id },
        relations: {
          employee: { primary_department: true, primary_position: true },
          leave_type: true,
          approvals: { approver: { user: true }, workflow_step: true },
          medical_detail: true,
          documents: { uploaded_by: { user: true } },
        },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: leaveRequest.id,
      action: 'leave_request.created',
      entity_name: 'leave_request',
      entity_id: leaveRequest.id,
      actor,
      payload: this.mapLeaveRequest(leaveRequest),
    });

    return this.mapLeaveRequest(leaveRequest);
  }

  async submitLeaveRequest(
    companyId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: {
        employee: {
          company_user: true,
          primary_department: true,
          primary_position: true,
        },
      },
    });

    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    if (leaveRequest.status !== LeaveStatusEnum.DRAFT) {
      throw new BadRequestException(
        'Only draft leave requests can be submitted',
      );
    }

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );
    this.assertEmployeeCanRequestLeave(
      leaveRequest.employee,
      leaveRequest.start_date,
      leaveRequest.end_date,
    );

    const leaveType = await this.findLeaveTypeOrFail(
      companyId,
      leaveRequest.leave_type_id,
    );
    if (leaveType.status !== LeaveRecordStatusEnum.ACTIVE) {
      throw new BadRequestException('Leave type is inactive');
    }

    this.assertDateOrder(
      leaveRequest.start_date,
      leaveRequest.end_date,
      'end_date cannot be before start_date',
    );

    if (
      leaveType.gender_restriction !== 'any' &&
      leaveRequest.employee.gender &&
      leaveRequest.employee.gender.toLowerCase() !==
        leaveType.gender_restriction
    ) {
      throw new BadRequestException(
        `Leave type is restricted to ${leaveType.gender_restriction}`,
      );
    }

    const totalDays = await this.calculateLeaveDays(
      companyId,
      leaveRequest.employee.primary_branch_id ?? null,
      leaveRequest.start_date,
      leaveRequest.end_date,
    );
    if (totalDays <= 0) {
      throw new BadRequestException(
        'Selected period results in zero leave days after holidays/weekends',
      );
    }

    await this.validateNoOverlap(
      companyId,
      leaveRequest.employee_id,
      leaveRequest.start_date,
      leaveRequest.end_date,
      leaveRequest.id,
    );

    const policyContext = await this.resolvePolicyContext(
      companyId,
      leaveRequest.employee,
      leaveRequest.leave_type_id,
    );

    if (
      policyContext.maxConsecutiveDays &&
      totalDays > policyContext.maxConsecutiveDays
    ) {
      throw new BadRequestException(
        `Leave exceeds maximum consecutive days (${policyContext.maxConsecutiveDays})`,
      );
    }

    if (
      policyContext.maxPerRequestDays &&
      totalDays > policyContext.maxPerRequestDays
    ) {
      throw new BadRequestException(
        `Leave exceeds maximum days per request (${policyContext.maxPerRequestDays})`,
      );
    }

    const serviceMonths = this.calculateServiceMonths(
      leaveRequest.employee.hire_date,
    );
    if (serviceMonths < policyContext.minServiceMonths) {
      throw new BadRequestException(
        `Employee requires minimum ${policyContext.minServiceMonths} month(s) of service`,
      );
    }

    const submitted = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRequest);
      const current = await repository.findOne({
        where: { id: leaveRequest.id, company_id: companyId },
      });

      if (!current) {
        throw new NotFoundException('Leave request not found');
      }

      if (current.status !== LeaveStatusEnum.DRAFT) {
        throw new BadRequestException(
          'Only draft leave requests can be submitted',
        );
      }

      current.total_days = this.leaveBalanceService.toDecimal(totalDays);
      current.reason = current.reason.trim();
      await repository.save(current);

      await this.submitLeaveRequestRecord(
        companyId,
        current,
        leaveRequest.employee,
        policyContext,
        actor,
        manager,
      );

      return repository.findOneOrFail({
        where: { id: current.id },
        relations: {
          employee: { primary_department: true, primary_position: true },
          leave_type: true,
          approvals: { approver: { user: true }, workflow_step: true },
          medical_detail: true,
          documents: { uploaded_by: { user: true } },
        },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: submitted.id,
      action: 'leave_request.submitted',
      entity_name: 'leave_request',
      entity_id: submitted.id,
      actor,
      payload: {
        status: submitted.status,
        applied_at: submitted.applied_at,
      },
    });

    return this.mapLeaveRequest(submitted);
  }

  async findAllLeaveRequests(
    companyId: number,
    query: LeaveRequestQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
      employee_id,
      leave_type_id,
      from_date,
      to_date,
    } = query;
    const scopedEmployeeId = await this.resolveScopedEmployeeId(
      companyId,
      employee_id,
      actor,
    );

    const qb = this.leaveRequestRepository
      .createQueryBuilder('leaveRequest')
      .leftJoinAndSelect('leaveRequest.employee', 'employee')
      .leftJoinAndSelect('employee.company_user', 'membership')
      .leftJoinAndSelect('employee.primary_department', 'department')
      .leftJoinAndSelect('employee.primary_position', 'position')
      .leftJoinAndSelect('leaveRequest.leave_type', 'leaveType')
      .leftJoinAndSelect('leaveRequest.approvals', 'approvals')
      .leftJoinAndSelect('approvals.approver', 'approvalMembership')
      .leftJoinAndSelect('approvalMembership.user', 'approvalUser')
      .leftJoinAndSelect('approvals.workflow_step', 'workflowStep')
      .where('leaveRequest.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('leaveRequest.status = :status', { status: status.trim() });
    }
    if (typeof scopedEmployeeId === 'number') {
      qb.andWhere('leaveRequest.employee_id = :employeeId', {
        employeeId: scopedEmployeeId,
      });
    }
    if (typeof leave_type_id === 'number') {
      qb.andWhere('leaveRequest.leave_type_id = :leaveTypeId', {
        leaveTypeId: leave_type_id,
      });
    }
    if (from_date) {
      qb.andWhere('leaveRequest.start_date >= :fromDate', {
        fromDate: from_date,
      });
    }
    if (to_date) {
      qb.andWhere('leaveRequest.end_date <= :toDate', { toDate: to_date });
    }
    if (search?.trim()) {
      qb.andWhere(
        '(leaveRequest.leave_no LIKE :term OR employee.employee_no LIKE :term)',
        {
          term: `%${search.trim()}%`,
        },
      );
    }

    const allowedSortFields = [
      'id',
      'leave_no',
      'start_date',
      'end_date',
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
      .orderBy(`leaveRequest.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    if (typeof scopedEmployeeId === 'number') {
      await this.assertCanAccessEmployeeById(
        companyId,
        scopedEmployeeId,
        actor,
      );
    }

    return {
      data: items.map((item) => this.mapLeaveRequest(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findMyLeaveRequests(
    companyId: number,
    query: LeaveRequestQueryDto,
    actor: AuthenticatedUser,
  ) {
    const employeeId = await this.resolveActorEmployeeIdOrFail(
      companyId,
      actor,
    );

    return this.findAllLeaveRequests(
      companyId,
      {
        ...query,
        employee_id: employeeId,
      },
      actor,
    );
  }

  async findOneLeaveRequest(
    companyId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: {
        employee: {
          primary_department: true,
          primary_position: true,
          company_user: true,
        },
        leave_type: true,
        approvals: { approver: { user: true }, workflow_step: true },
        medical_detail: true,
        documents: { uploaded_by: { user: true } },
      },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    const isOwnEmployee =
      typeof actor.companyMembershipId === 'number' &&
      leaveRequest.employee.company_user_id === actor.companyMembershipId;

    if (!isOwnEmployee) {
      await this.hrAccessService.assertCanAccessEmployee(
        actor,
        leaveRequest.employee,
      );
    }

    return this.mapLeaveRequest(leaveRequest);
  }

  async approveLeaveRequest(
    companyId: number,
    leaveRequestId: number,
    dto: LeaveApprovalActionDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    const membershipId = actor.companyMembershipId!;
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: { id: leaveRequestId, company_id: companyId },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    const totalDays = this.leaveBalanceService.toNumber(
      leaveRequest.total_days,
    );
    const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
      leaveRequest.start_date,
    );
    const employee = await this.findEmployeeOrFail(
      companyId,
      leaveRequest.employee_id,
    );

    const updated = await this.dataSource.transaction(async (manager) => {
      const updatedRequest =
        await this.leaveWorkflowService.applyApprovalAction(
          leaveRequest.id,
          membershipId,
          dto,
          manager,
        );

      const balance = await this.leaveBalanceService.ensureBalanceForEmployee(
        companyId,
        employee,
        leaveRequest.leave_type_id,
        fiscalYear,
        manager,
      );

      if (updatedRequest.status === LeaveStatusEnum.APPROVED) {
        await this.leaveBalanceService.consumeReservedDays(
          balance,
          totalDays,
          manager,
        );
      } else if (updatedRequest.status === LeaveStatusEnum.REJECTED) {
        await this.leaveBalanceService.releaseReservedDays(
          balance,
          totalDays,
          manager,
        );
      }

      return manager.getRepository(LeaveRequest).findOneOrFail({
        where: { id: leaveRequest.id },
        relations: {
          employee: { primary_department: true, primary_position: true },
          leave_type: true,
          approvals: { approver: { user: true }, workflow_step: true },
          medical_detail: true,
          documents: { uploaded_by: { user: true } },
        },
      });
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: updated.id,
      action: dto.approve
        ? 'leave_request.approved_step'
        : 'leave_request.rejected',
      entity_name: 'leave_request',
      entity_id: updated.id,
      actor,
      payload: {
        status: updated.status,
        current_approval_level: updated.current_approval_level,
      },
    });

    if (updated.status === LeaveStatusEnum.APPROVED) {
      await this.queueAttendanceRecalculationForLeaveWindow(
        companyId,
        updated.employee_id,
        updated.start_date,
        updated.end_date,
        'Leave request approved',
        actor,
      );
    }

    return this.mapLeaveRequest(updated);
  }

  async cancelLeaveRequest(
    companyId: number,
    leaveRequestId: number,
    dto: CancelLeaveRequestDto,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: { employee: { company_user: true } },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );

    if (
      leaveRequest.status === LeaveStatusEnum.CANCELLED ||
      leaveRequest.status === LeaveStatusEnum.REJECTED
    ) {
      throw new BadRequestException('Leave request is already closed');
    }

    const totalDays = this.leaveBalanceService.toNumber(
      leaveRequest.total_days,
    );
    const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
      leaveRequest.start_date,
    );
    const employee = await this.findEmployeeOrFail(
      companyId,
      leaveRequest.employee_id,
    );

    const cancelled = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LeaveRequest);
      const balance = await this.leaveBalanceService.ensureBalanceForEmployee(
        companyId,
        employee,
        leaveRequest.leave_type_id,
        fiscalYear,
        manager,
      );

      if (
        leaveRequest.status === LeaveStatusEnum.SUBMITTED ||
        leaveRequest.status === LeaveStatusEnum.IN_REVIEW
      ) {
        await this.leaveBalanceService.releaseReservedDays(
          balance,
          totalDays,
          manager,
        );
      } else if (leaveRequest.status === LeaveStatusEnum.APPROVED) {
        const used = this.leaveBalanceService.toNumber(balance.used_days);
        balance.used_days = this.leaveBalanceService.toDecimal(
          Math.max(0, used - totalDays),
        );
        await manager.getRepository(LeaveBalance).save(balance);
      }

      await this.leaveWorkflowService.closeAllPendingApprovals(
        leaveRequest.id,
        'Skipped after leave cancellation',
        manager,
      );

      leaveRequest.status = LeaveStatusEnum.CANCELLED;
      leaveRequest.cancelled_at = new Date();
      leaveRequest.rejection_reason = dto.reason?.trim() || null;
      return repository.save(leaveRequest);
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: cancelled.id,
      action: 'leave_request.cancelled',
      entity_name: 'leave_request',
      entity_id: cancelled.id,
      actor,
      payload: { reason: dto.reason ?? null },
    });

    await this.queueAttendanceRecalculationForLeaveWindow(
      companyId,
      cancelled.employee_id,
      cancelled.start_date,
      cancelled.end_date,
      'Leave request cancelled',
      actor,
    );

    return {
      message: 'Leave request cancelled successfully',
    };
  }

  async addLeaveDocument(
    companyId: number,
    leaveRequestId: number,
    dto: AddLeaveDocumentDto,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: { employee: { company_user: true } },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }
    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );

    const document = await this.leaveDocumentRepository.save(
      this.leaveDocumentRepository.create({
        leave_request_id: leaveRequest.id,
        file_url: dto.file_url.trim(),
        file_name: dto.file_name.trim(),
        file_type: dto.file_type.trim(),
        uploaded_by_company_user_id: actor.companyMembershipId!,
      }),
    );

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: leaveRequest.id,
      action: 'leave_request.document_added',
      entity_name: 'leave_document',
      entity_id: document.id,
      actor,
      payload: {
        file_name: document.file_name,
        file_type: document.file_type,
      },
    });

    return document;
  }

  async upsertMedicalDetail(
    companyId: number,
    leaveRequestId: number,
    dto: UpsertLeaveMedicalDetailDto,
    actor: AuthenticatedUser,
  ) {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: { employee: { company_user: true } },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }
    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );

    if (dto.treatment_start_date && dto.treatment_end_date) {
      this.assertDateOrder(
        dto.treatment_start_date,
        dto.treatment_end_date,
        'treatment_end_date cannot be before treatment_start_date',
      );
    }

    let medical = await this.leaveMedicalDetailRepository.findOne({
      where: { leave_request_id: leaveRequest.id },
    });
    if (!medical) {
      medical = this.leaveMedicalDetailRepository.create({
        leave_request_id: leaveRequest.id,
      });
    }

    if (dto.sickness_nature !== undefined) {
      medical.sickness_nature = this.normalizeOptionalString(
        dto.sickness_nature,
      );
    }
    if (dto.doctor_name !== undefined) {
      medical.doctor_name = this.normalizeOptionalString(dto.doctor_name);
    }
    if (dto.doctor_phone !== undefined) {
      medical.doctor_phone = this.normalizeOptionalString(dto.doctor_phone);
    }
    if (dto.hospital_name !== undefined) {
      medical.hospital_name = this.normalizeOptionalString(dto.hospital_name);
    }
    if (dto.treatment_start_date !== undefined) {
      medical.treatment_start_date = dto.treatment_start_date ?? null;
    }
    if (dto.treatment_end_date !== undefined) {
      medical.treatment_end_date = dto.treatment_end_date ?? null;
    }
    if (dto.attachment_url !== undefined) {
      medical.attachment_url = this.normalizeOptionalString(dto.attachment_url);
    }

    const saved = await this.leaveMedicalDetailRepository.save(medical);

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: leaveRequest.id,
      action: 'leave_request.medical_detail_upserted',
      entity_name: 'leave_medical_detail',
      entity_id: saved.id,
      actor,
    });

    return saved;
  }

  async getLeaveRequestPdf(
    companyId: number,
    leaveRequestId: number,
    actor: AuthenticatedUser,
  ): Promise<Buffer> {
    const leaveRequest = await this.leaveRequestRepository.findOne({
      where: {
        id: leaveRequestId,
        company_id: companyId,
      },
      relations: {
        company: true,
        employee: {
          primary_department: true,
          primary_position: true,
          company_user: true,
        },
        leave_type: true,
        approvals: { approver: { user: true }, workflow_step: true },
      },
    });
    if (!leaveRequest) {
      throw new NotFoundException('Leave request not found');
    }

    await this.hrAccessService.assertCanAccessEmployee(
      actor,
      leaveRequest.employee,
    );

    const fiscalYear = this.leaveBalanceService.getFiscalYearFromDate(
      leaveRequest.start_date,
    );
    const balance = await this.leaveBalanceRepository.findOne({
      where: {
        employee_id: leaveRequest.employee_id,
        leave_type_id: leaveRequest.leave_type_id,
        fiscal_year: fiscalYear,
      },
    });

    const pdf = await this.leavePdfService.generateLeaveFormPdf({
      company_name: leaveRequest.company.name,
      company_logo_url: (
        leaveRequest.company.metadata as { logo_url?: string } | null
      )?.logo_url,
      leave_no: leaveRequest.leave_no,
      employee_no: leaveRequest.employee.employee_no,
      employee_name: this.buildEmployeeName(leaveRequest.employee),
      department_name: leaveRequest.employee.primary_department?.name ?? null,
      position_name: leaveRequest.employee.primary_position?.name ?? null,
      leave_type_name: leaveRequest.leave_type.name,
      start_date: leaveRequest.start_date,
      end_date: leaveRequest.end_date,
      total_days: leaveRequest.total_days,
      reason: leaveRequest.reason,
      status: leaveRequest.status,
      applied_at: leaveRequest.applied_at,
      approved_at: leaveRequest.approved_at,
      current_balance: balance
        ? {
            fiscal_year: balance.fiscal_year,
            allocated_days: balance.allocated_days,
            used_days: balance.used_days,
            pending_days: balance.pending_days,
            carried_forward_days: balance.carried_forward_days,
            expired_days: balance.expired_days,
            available_days: this.leaveBalanceService
              .calculateAvailableDays(balance)
              .toFixed(2),
          }
        : null,
      approval_history: leaveRequest.approvals
        .sort((a, b) => a.approval_level - b.approval_level || a.id - b.id)
        .map((approval) => ({
          level: approval.approval_level,
          action: approval.workflow_step?.action_type ?? 'review',
          status: approval.status,
          approver_name: approval.approver?.user
            ? `${approval.approver.user.first_name} ${approval.approver.user.last_name}`
            : null,
          comments: approval.comments,
          acted_at: approval.acted_at,
          signature_url: approval.signature_url,
        })),
    });

    await this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: leaveRequest.id,
      action: 'leave_request.pdf_generated',
      entity_name: 'leave_request',
      entity_id: leaveRequest.id,
      actor,
    });

    return pdf;
  }
}
