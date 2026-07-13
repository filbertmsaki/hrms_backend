import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDailyStatusEnum } from '../../attendance/processing/enums/attendance-daily-status.enum';
import { LeaveBalanceAdjustmentModeEnum } from '../enums/leave-balance-adjustment-mode.enum';
import { LeaveBalanceAdjustmentSourceEnum } from '../enums/leave-balance-adjustment-source.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { LeaveBalanceAdjustment } from '../entities/leave-balance-adjustment.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeavePolicyType } from '../entities/leave-policy-type.entity';
import { LeavePolicy } from '../entities/leave-policy.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveAuditService } from './leave-audit.service';

type EmployeeScope = Pick<
  Employee,
  'id' | 'primary_department_id' | 'primary_position_id' | 'primary_branch_id'
>;

type PolicyAssignment = {
  policy: LeavePolicy;
  policyType: LeavePolicyType;
  annualQuotaDays: number;
};

type EnsureBalanceOptions = {
  forceRecalculate?: boolean;
  leaveType?: LeaveType;
};

type GenerateBalanceOptions = {
  employeeId?: number;
  leaveTypeId?: number;
  forceRecalculate?: boolean;
};

@Injectable()
export class LeaveBalanceService {
  constructor(
    @InjectRepository(LeaveBalance)
    private readonly leaveBalanceRepository: Repository<LeaveBalance>,
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepository: Repository<LeaveType>,
    @InjectRepository(LeavePolicy)
    private readonly leavePolicyRepository: Repository<LeavePolicy>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(LeaveBalanceAdjustment)
    private readonly leaveBalanceAdjustmentRepository: Repository<LeaveBalanceAdjustment>,
    private readonly leaveAuditService: LeaveAuditService,
  ) {}

  private getBalanceRepository(
    manager?: EntityManager,
  ): Repository<LeaveBalance> {
    return manager?.getRepository(LeaveBalance) ?? this.leaveBalanceRepository;
  }

  private getLeaveTypeRepository(
    manager?: EntityManager,
  ): Repository<LeaveType> {
    return manager?.getRepository(LeaveType) ?? this.leaveTypeRepository;
  }

  private getLeavePolicyRepository(
    manager?: EntityManager,
  ): Repository<LeavePolicy> {
    return manager?.getRepository(LeavePolicy) ?? this.leavePolicyRepository;
  }

  private getLeaveRequestRepository(
    manager?: EntityManager,
  ): Repository<LeaveRequest> {
    return manager?.getRepository(LeaveRequest) ?? this.leaveRequestRepository;
  }

  private getEmployeeRepository(manager?: EntityManager): Repository<Employee> {
    return manager?.getRepository(Employee) ?? this.employeeRepository;
  }

  private getAttendanceDailySummaryRepository(
    manager?: EntityManager,
  ): Repository<AttendanceDailySummary> {
    return (
      manager?.getRepository(AttendanceDailySummary) ??
      this.attendanceDailySummaryRepository
    );
  }

  private getLeaveBalanceAdjustmentRepository(
    manager?: EntityManager,
  ): Repository<LeaveBalanceAdjustment> {
    return (
      manager?.getRepository(LeaveBalanceAdjustment) ??
      this.leaveBalanceAdjustmentRepository
    );
  }

  toNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  toDecimal(value: number): string {
    return value.toFixed(2);
  }

  normalizeFiscalYear(fiscalYear: string): string {
    const normalized = fiscalYear.trim();
    if (!/^\d{4}$/.test(normalized)) {
      throw new BadRequestException('fiscal_year must be a four-digit year');
    }

    return normalized;
  }

  getFiscalYearFromDate(date: string | Date): string {
    const source = typeof date === 'string' ? new Date(date) : date;
    return String(source.getUTCFullYear());
  }

  private getPreviousFiscalYear(fiscalYear: string): string | null {
    const parsed = Number(fiscalYear);
    if (!Number.isInteger(parsed)) {
      return null;
    }

    return String(parsed - 1);
  }

  private getFiscalYearBounds(fiscalYear: string): {
    startDate: string;
    endDate: string;
  } {
    const normalized = this.normalizeFiscalYear(fiscalYear);
    return {
      startDate: `${normalized}-01-01`,
      endDate: `${normalized}-12-31`,
    };
  }

  private calculatePolicyPriority(
    policy: LeavePolicy,
    employee: Pick<Employee, 'primary_department_id' | 'primary_position_id'>,
  ): number {
    const departmentMatch =
      policy.applicable_department_id !== null &&
      policy.applicable_department_id === employee.primary_department_id;
    const positionMatch =
      policy.applicable_position_id !== null &&
      policy.applicable_position_id === employee.primary_position_id;

    if (departmentMatch && positionMatch) {
      return 4;
    }
    if (positionMatch) {
      return 3;
    }
    if (departmentMatch) {
      return 2;
    }
    if (
      policy.applicable_department_id === null &&
      policy.applicable_position_id === null
    ) {
      return 1;
    }

    return 0;
  }

  async resolvePolicyAssignment(
    companyId: number,
    employee: Pick<Employee, 'primary_department_id' | 'primary_position_id'>,
    leaveTypeId: number,
    manager?: EntityManager,
  ): Promise<PolicyAssignment | null> {
    const repository = this.getLeavePolicyRepository(manager);
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
      priority: number;
      policy: LeavePolicy;
      policyType: LeavePolicyType;
      annualQuotaDays: number;
    } | null = null;

    for (const policy of policies) {
      const policyType = policy.leave_types.find(
        (item) => item.leave_type_id === leaveTypeId,
      );
      if (!policyType) {
        continue;
      }

      const priority = this.calculatePolicyPriority(policy, employee);
      if (!priority) {
        continue;
      }

      const annualQuotaDays = this.toNumber(policyType.annual_quota_days);
      if (!selected || priority > selected.priority) {
        selected = {
          priority,
          policy,
          policyType,
          annualQuotaDays,
        };
      }
    }

    return selected
      ? {
          policy: selected.policy,
          policyType: selected.policyType,
          annualQuotaDays: selected.annualQuotaDays,
        }
      : null;
  }

  private calculateCarryForwardDays(
    previousBalance: LeaveBalance | null,
    leaveType: LeaveType,
  ): number {
    if (!previousBalance || !leaveType.is_carry_forward_allowed) {
      return 0;
    }

    const remaining = this.calculateAvailableDays(previousBalance);
    if (remaining <= 0) {
      return 0;
    }

    const maxCarryForward = this.toNumber(leaveType.max_carry_forward_days);
    if (maxCarryForward <= 0) {
      return remaining;
    }

    return Math.min(remaining, maxCarryForward);
  }

  private async summarizeLeaveUsage(
    employeeId: number,
    leaveTypeId: number,
    fiscalYear: string,
    manager?: EntityManager,
  ): Promise<{ usedDays: number; pendingDays: number }> {
    const { startDate, endDate } = this.getFiscalYearBounds(fiscalYear);
    const requests = await this.getLeaveRequestRepository(manager).find({
      where: {
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
      },
      select: ['status', 'total_days', 'start_date'],
    });

    let usedDays = 0;
    let pendingDays = 0;

    for (const request of requests) {
      if (request.start_date < startDate || request.start_date > endDate) {
        continue;
      }

      const totalDays = this.toNumber(request.total_days);
      if (request.status === LeaveStatusEnum.APPROVED) {
        usedDays += totalDays;
        continue;
      }

      if (
        request.status === LeaveStatusEnum.SUBMITTED ||
        request.status === LeaveStatusEnum.IN_REVIEW
      ) {
        pendingDays += totalDays;
      }
    }

    return { usedDays, pendingDays };
  }

  private async calculateAttendanceDeductionDays(
    companyId: number,
    employeeId: number,
    leaveType: LeaveType,
    fiscalYear: string,
    assignment: PolicyAssignment | null,
    manager?: EntityManager,
  ): Promise<number> {
    if (
      leaveType.code !== 'ANNUAL' ||
      !assignment?.policy.attendance_balance_deduction_enabled
    ) {
      return 0;
    }

    const { startDate, endDate } = this.getFiscalYearBounds(fiscalYear);
    const rawRows = await this.getAttendanceDailySummaryRepository(manager)
      .createQueryBuilder('summary')
      .select('summary.attendanceStatus', 'attendanceStatus')
      .addSelect('COUNT(summary.id)', 'count')
      .where('summary.companyId = :companyId', { companyId })
      .andWhere('summary.employeeId = :employeeId', { employeeId })
      .andWhere('summary.attendanceDate >= :startDate', { startDate })
      .andWhere('summary.attendanceDate <= :endDate', { endDate })
      .andWhere('summary.attendanceStatus IN (:...statuses)', {
        statuses: [
          AttendanceDailyStatusEnum.ABSENT,
          AttendanceDailyStatusEnum.UNPAID_LEAVE,
          AttendanceDailyStatusEnum.HALF_DAY,
        ],
      })
      .groupBy('summary.attendanceStatus')
      .getRawMany<{ attendanceStatus: string; count: string }>();

    const counts = new Map(
      rawRows.map((row) => [row.attendanceStatus, Number(row.count)]),
    );

    return (
      (counts.get(AttendanceDailyStatusEnum.ABSENT) ?? 0) *
        this.toNumber(assignment.policy.absent_day_deduction_days) +
      (counts.get(AttendanceDailyStatusEnum.UNPAID_LEAVE) ?? 0) *
        this.toNumber(assignment.policy.unpaid_leave_day_deduction_days) +
      (counts.get(AttendanceDailyStatusEnum.HALF_DAY) ?? 0) *
        this.toNumber(assignment.policy.half_day_deduction_days)
    );
  }

  async recalculateBalance(
    companyId: number,
    employee: EmployeeScope,
    leaveTypeId: number,
    fiscalYear: string,
    manager?: EntityManager,
    existingBalance?: LeaveBalance | null,
    leaveTypeOverride?: LeaveType,
  ): Promise<LeaveBalance> {
    const normalizedFiscalYear = this.normalizeFiscalYear(fiscalYear);
    const leaveTypeRepository = this.getLeaveTypeRepository(manager);
    const balanceRepository = this.getBalanceRepository(manager);
    const leaveType =
      leaveTypeOverride ??
      (await leaveTypeRepository.findOne({
        where: {
          id: leaveTypeId,
          company_id: companyId,
        },
      }));

    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }

    const balance =
      existingBalance ??
      (await balanceRepository.findOne({
        where: {
          employee_id: employee.id,
          leave_type_id: leaveTypeId,
          fiscal_year: normalizedFiscalYear,
        },
      })) ??
      balanceRepository.create({
        employee_id: employee.id,
        leave_type_id: leaveTypeId,
        fiscal_year: normalizedFiscalYear,
      });

    const assignment = await this.resolvePolicyAssignment(
      companyId,
      employee,
      leaveTypeId,
      manager,
    );
    const entitlementDays =
      assignment?.annualQuotaDays ?? this.toNumber(leaveType.max_days_per_year);

    const previousFiscalYear = this.getPreviousFiscalYear(normalizedFiscalYear);
    const previousBalance = previousFiscalYear
      ? await balanceRepository.findOne({
          where: {
            employee_id: employee.id,
            leave_type_id: leaveTypeId,
            fiscal_year: previousFiscalYear,
          },
        })
      : null;
    const carriedForwardDays = this.calculateCarryForwardDays(
      previousBalance,
      leaveType,
    );
    const usage = await this.summarizeLeaveUsage(
      employee.id,
      leaveTypeId,
      normalizedFiscalYear,
      manager,
    );
    const attendanceDeductionDays = await this.calculateAttendanceDeductionDays(
      companyId,
      employee.id,
      leaveType,
      normalizedFiscalYear,
      assignment,
      manager,
    );

    balance.allocated_days = this.toDecimal(entitlementDays);
    balance.company_id = companyId;
    balance.opening_balance_days = this.toDecimal(carriedForwardDays);
    balance.entitlement_days = this.toDecimal(entitlementDays);
    balance.accrued_days = this.toDecimal(entitlementDays);
    balance.used_days = this.toDecimal(usage.usedDays);
    balance.pending_days = this.toDecimal(usage.pendingDays);
    balance.approved_future_days =
      balance.approved_future_days ?? this.toDecimal(0);
    balance.carried_forward_days = this.toDecimal(carriedForwardDays);
    balance.expired_days = balance.expired_days ?? this.toDecimal(0);
    balance.adjusted_days = balance.adjusted_days ?? this.toDecimal(0);
    balance.attendance_deduction_days = this.toDecimal(attendanceDeductionDays);
    balance.generated_at = balance.generated_at ?? new Date();
    balance.leave_year_start_date = `${normalizedFiscalYear}-01-01`;
    balance.leave_year_end_date = `${normalizedFiscalYear}-12-31`;
    balance.version = balance.version ?? 1;

    return balanceRepository.save(balance);
  }

  async ensureBalanceForEmployee(
    companyId: number,
    employee: EmployeeScope,
    leaveTypeId: number,
    fiscalYear: string,
    manager?: EntityManager,
    options?: EnsureBalanceOptions,
  ): Promise<LeaveBalance> {
    const normalizedFiscalYear = this.normalizeFiscalYear(fiscalYear);
    const balanceRepository = this.getBalanceRepository(manager);
    const existing = await balanceRepository.findOne({
      where: {
        employee_id: employee.id,
        leave_type_id: leaveTypeId,
        fiscal_year: normalizedFiscalYear,
      },
    });

    if (existing && !options?.forceRecalculate) {
      return existing;
    }

    return this.recalculateBalance(
      companyId,
      employee,
      leaveTypeId,
      normalizedFiscalYear,
      manager,
      existing,
      options?.leaveType,
    );
  }

  async ensureBalancesForEmployeeYear(
    companyId: number,
    employee: EmployeeScope,
    fiscalYear: string,
    manager?: EntityManager,
    leaveTypeId?: number,
    forceRecalculate = false,
  ): Promise<LeaveBalance[]> {
    const leaveTypeRepository = this.getLeaveTypeRepository(manager);
    const leaveTypes = await leaveTypeRepository.find({
      where: {
        company_id: companyId,
        status: LeaveRecordStatusEnum.ACTIVE,
      },
    });

    const filteredLeaveTypes =
      typeof leaveTypeId === 'number'
        ? leaveTypes.filter((item) => item.id === leaveTypeId)
        : leaveTypes;

    if (typeof leaveTypeId === 'number' && !filteredLeaveTypes.length) {
      throw new NotFoundException('Leave type not found');
    }

    const balances: LeaveBalance[] = [];
    for (const leaveType of filteredLeaveTypes) {
      balances.push(
        await this.ensureBalanceForEmployee(
          companyId,
          employee,
          leaveType.id,
          fiscalYear,
          manager,
          {
            forceRecalculate,
            leaveType,
          },
        ),
      );
    }

    return balances;
  }

  async generateBalancesForCompany(
    companyId: number,
    fiscalYear: string,
    options: GenerateBalanceOptions = {},
    manager?: EntityManager,
  ): Promise<{
    fiscal_year: string;
    processed_employees: number;
    generated_balances: number;
  }> {
    const normalizedFiscalYear = this.normalizeFiscalYear(fiscalYear);
    const employeeRepository = this.getEmployeeRepository(manager);

    const employees =
      typeof options.employeeId === 'number'
        ? await employeeRepository.find({
            where: { id: options.employeeId },
            relations: { company_user: true },
          })
        : await employeeRepository.find({
            where: {
              employment_status: EmploymentStatusEnum.ACTIVE,
            },
            relations: { company_user: true },
          });

    const scopedEmployees = employees.filter(
      (employee) => employee.company_user?.company_id === companyId,
    );

    if (typeof options.employeeId === 'number' && !scopedEmployees.length) {
      throw new NotFoundException('Employee not found');
    }

    let generatedBalances = 0;
    for (const employee of scopedEmployees) {
      const balances = await this.ensureBalancesForEmployeeYear(
        companyId,
        employee,
        normalizedFiscalYear,
        manager,
        options.leaveTypeId,
        options.forceRecalculate ?? false,
      );
      generatedBalances += balances.length;
    }

    return {
      fiscal_year: normalizedFiscalYear,
      processed_employees: scopedEmployees.length,
      generated_balances: generatedBalances,
    };
  }

  calculateAvailableDays(balance: LeaveBalance): number {
    const openingBalance = this.toNumber(balance.opening_balance_days)
      ? this.toNumber(balance.opening_balance_days)
      : this.toNumber(balance.carried_forward_days);
    const entitlementDays = this.toNumber(balance.entitlement_days)
      ? this.toNumber(balance.entitlement_days)
      : this.toNumber(balance.allocated_days);

    return (
      openingBalance +
      entitlementDays +
      this.toNumber(balance.adjusted_days) -
      this.toNumber(balance.used_days) -
      this.toNumber(balance.pending_days) -
      this.toNumber(balance.approved_future_days) -
      this.toNumber(balance.expired_days) -
      this.toNumber(balance.attendance_deduction_days)
    );
  }

  async reserveDays(
    balance: LeaveBalance,
    days: number,
    allowNegativeBalance: boolean,
    manager?: EntityManager,
  ): Promise<LeaveBalance> {
    if (days <= 0) {
      throw new BadRequestException('Leave days must be greater than zero');
    }

    const available = this.calculateAvailableDays(balance);
    if (!allowNegativeBalance && available < days) {
      throw new BadRequestException(
        `Insufficient leave balance. Available: ${available.toFixed(2)} day(s)`,
      );
    }

    balance.pending_days = this.toDecimal(
      this.toNumber(balance.pending_days) + days,
    );

    return this.getBalanceRepository(manager).save(balance);
  }

  async releaseReservedDays(
    balance: LeaveBalance,
    days: number,
    manager?: EntityManager,
  ): Promise<LeaveBalance> {
    const pending = this.toNumber(balance.pending_days);
    balance.pending_days = this.toDecimal(Math.max(0, pending - days));
    return this.getBalanceRepository(manager).save(balance);
  }

  async consumeReservedDays(
    balance: LeaveBalance,
    days: number,
    manager?: EntityManager,
  ): Promise<LeaveBalance> {
    const pending = this.toNumber(balance.pending_days);
    const used = this.toNumber(balance.used_days);

    balance.pending_days = this.toDecimal(Math.max(0, pending - days));
    balance.used_days = this.toDecimal(used + days);

    return this.getBalanceRepository(manager).save(balance);
  }

  async applyManualAdjustment(
    companyId: number,
    employee: EmployeeScope,
    leaveTypeId: number,
    fiscalYear: string,
    payload: {
      mode: LeaveBalanceAdjustmentModeEnum;
      amount: number;
      reason: string;
    },
    actor: Pick<CompanyUser, 'id'> | null,
    manager?: EntityManager,
  ): Promise<LeaveBalance> {
    if (payload.amount < 0) {
      throw new BadRequestException('Adjustment amount cannot be negative');
    }

    const balance = await this.ensureBalanceForEmployee(
      companyId,
      employee,
      leaveTypeId,
      fiscalYear,
      manager,
      { forceRecalculate: true },
    );

    const previousAvailable = this.calculateAvailableDays(balance);
    let delta = payload.amount;
    if (payload.mode === LeaveBalanceAdjustmentModeEnum.DEDUCT) {
      delta = -payload.amount;
    } else if (payload.mode === LeaveBalanceAdjustmentModeEnum.SET) {
      delta = payload.amount - previousAvailable;
    }

    balance.adjusted_days = this.toDecimal(
      this.toNumber(balance.adjusted_days) + delta,
    );

    const savedBalance = await this.getBalanceRepository(manager).save(balance);
    const newAvailable = this.calculateAvailableDays(savedBalance);

    await this.getLeaveBalanceAdjustmentRepository(manager).save(
      this.getLeaveBalanceAdjustmentRepository(manager).create({
        company_id: companyId,
        leave_balance_id: savedBalance.id,
        employee_id: employee.id,
        leave_type_id: leaveTypeId,
        fiscal_year: this.normalizeFiscalYear(fiscalYear),
        old_balance_days: this.toDecimal(previousAvailable),
        new_balance_days: this.toDecimal(newAvailable),
        adjustment_amount_days: this.toDecimal(delta),
        reason: payload.reason.trim(),
        source: LeaveBalanceAdjustmentSourceEnum.MANUAL,
        adjusted_by_company_user_id: actor?.id ?? null,
      }),
    );

    return savedBalance;
  }

  async findBalanceAdjustments(
    companyId: number,
    filters: {
      employeeIds: number[] | null;
      employeeId?: number;
      leaveTypeId?: number;
      fiscalYear?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const {
      employeeIds,
      employeeId,
      leaveTypeId,
      fiscalYear,
      page = 1,
      limit = 20,
    } = filters;

    const qb = this.leaveBalanceAdjustmentRepository
      .createQueryBuilder('adjustment')
      .leftJoinAndSelect('adjustment.employee', 'employee')
      .leftJoinAndSelect('adjustment.leave_type', 'leaveType')
      .leftJoinAndSelect(
        'adjustment.adjusted_by_company_user',
        'adjustedByMembership',
      )
      .leftJoinAndSelect('adjustedByMembership.user', 'adjustedByUser')
      .where('adjustment.company_id = :companyId', { companyId });

    if (employeeIds && employeeIds.length) {
      qb.andWhere('adjustment.employee_id IN (:...employeeIds)', {
        employeeIds,
      });
    }
    if (typeof employeeId === 'number') {
      qb.andWhere('adjustment.employee_id = :employeeId', { employeeId });
    }
    if (typeof leaveTypeId === 'number') {
      qb.andWhere('adjustment.leave_type_id = :leaveTypeId', { leaveTypeId });
    }
    if (fiscalYear?.trim()) {
      qb.andWhere('adjustment.fiscal_year = :fiscalYear', {
        fiscalYear: this.normalizeFiscalYear(fiscalYear),
      });
    }

    return qb
      .orderBy('adjustment.adjusted_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  async synchronizeAttendanceImpactForEmployeeYear(
    companyId: number,
    employee: EmployeeScope,
    fiscalYear: string,
    manager?: EntityManager,
    reason = 'Attendance recalculation',
  ): Promise<LeaveBalance[]> {
    const leaveTypes = await this.getLeaveTypeRepository(manager).find({
      where: {
        company_id: companyId,
        status: LeaveRecordStatusEnum.ACTIVE,
        code: 'ANNUAL',
      },
    });

    const changedBalances: LeaveBalance[] = [];

    for (const leaveType of leaveTypes) {
      const existing = await this.getBalanceRepository(manager).findOne({
        where: {
          employee_id: employee.id,
          leave_type_id: leaveType.id,
          fiscal_year: this.normalizeFiscalYear(fiscalYear),
        },
      });
      const previousAttendanceDeduction = existing
        ? this.toNumber(existing.attendance_deduction_days)
        : 0;
      const previousAvailableDays = existing
        ? this.calculateAvailableDays(existing)
        : 0;

      const updated = await this.ensureBalanceForEmployee(
        companyId,
        employee,
        leaveType.id,
        fiscalYear,
        manager,
        {
          forceRecalculate: true,
          leaveType,
        },
      );

      const nextAttendanceDeduction = this.toNumber(
        updated.attendance_deduction_days,
      );
      const nextAvailableDays = this.calculateAvailableDays(updated);

      if (
        previousAttendanceDeduction !== nextAttendanceDeduction ||
        previousAvailableDays !== nextAvailableDays
      ) {
        changedBalances.push(updated);
        await this.leaveAuditService.log(
          {
            company_id: companyId,
            action: 'leave_balance.attendance_recalculated',
            entity_name: 'leave_balance',
            entity_id: updated.id,
            payload: {
              reason,
              fiscal_year: updated.fiscal_year,
              employee_id: updated.employee_id,
              leave_type_id: updated.leave_type_id,
              previous_attendance_deduction_days: this.toDecimal(
                previousAttendanceDeduction,
              ),
              next_attendance_deduction_days: updated.attendance_deduction_days,
              previous_available_days: this.toDecimal(previousAvailableDays),
              next_available_days: this.toDecimal(nextAvailableDays),
            },
          },
          manager,
        );
      }
    }

    return changedBalances;
  }
}
