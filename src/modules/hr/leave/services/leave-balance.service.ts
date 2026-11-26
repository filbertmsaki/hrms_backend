import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { LeaveStatutoryService } from './leave-statutory.service';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDailyStatusEnum } from '../../attendance/processing/enums/attendance-daily-status.enum';
import { LeaveAccrualMethodEnum } from '../enums/leave-accrual-method.enum';
import { roundLeaveDays } from '../utils/leave-accrual.util';
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
import {
  calculateAvailableLeaveDays,
  isEmployeeEligibleForLeaveType,
  isLeaveBalanceVisibleForEmployee,
} from '../utils/leave-balance-rules.util';
import { isPolicyEffectiveOn } from '../utils/leave-policy-version.util';
import { carryForwardDaysFor } from '../utils/leave-policy-calculations.util';
import {
  LeaveCycle,
  LeaveCycleConfig,
  leaveCycleForDate,
  leaveCycleForLabel,
} from '../utils/leave-cycle.util';
import { LeaveAuditService } from './leave-audit.service';
import { LeaveBalanceTransaction } from '../entities/leave-balance-transaction.entity';
import { LeaveBalanceTransactionTypeEnum } from '../enums/leave-balance-transaction-type.enum';
import {
  AccrualFrequency,
  AccrualResult,
  AccrualStart,
  AccrualStartBasis,
  AccrualTiming,
  computeAccrual,
  resolveAccrualStart,
} from '../utils/leave-accrual-engine.util';

/** Accrual settings in force for one leave type under a policy. */
export type AccrualConfig = Pick<
  LeavePolicy,
  'accrual_method' | 'accrual_rate'
> &
  LeaveCycleConfig & {
    /** Per leave type (policy type); defaults keep the original behaviour. */
    accrual_start_basis?: AccrualStartBasis;
    accrual_timing?: AccrualTiming;
    accrual_prorate?: boolean;
  };

export type CarryForwardPolicy = {
  enabled: boolean;
  /** null = no cap */
  maxDays: number | null;
  expiryMonths: number | null;
  /** MM-DD in the new leave year */
  expiryDate: string | null;
  autoExpire: boolean;
  consumeFirst: boolean;
  /** all | limited (maxDays) | percentage (of unused days, then maxDays). */
  method?: 'all' | 'limited' | 'percentage';
  /** 0–100, used by the percentage method. */
  percentage?: number | null;
};

type EmployeeScope = Pick<
  Employee,
  'id' | 'primary_department_id' | 'primary_position_id' | 'primary_branch_id'
> &
  Partial<
    Pick<
      Employee,
      | 'grade_id'
      | 'employment_type'
      | 'confirmation_status'
      | 'hire_date'
      | 'exit_date'
      | 'probation_start_date'
      | 'probation_end_date'
      | 'confirmation_due_date'
      | 'confirmation_date'
      | 'gender'
    >
  >;

export type PolicyAssignment = {
  policy: LeavePolicy;
  policyType: LeavePolicyType;
  annualQuotaDays: number;
};

type EnsureBalanceOptions = {
  forceRecalculate?: boolean;
  /** Recalculation runs only: allow accrued days to go down. */
  allowAccrualDecrease?: boolean;
  /** Ledger reference for corrections posted by a recalculation run. */
  recalculationRunId?: number | null;
  actorCompanyUserId?: number | null;
  /** Calculate accrual as at this date (recalculation previews); default today. */
  asOfDate?: string;
  leaveType?: LeaveType;
  preferredPolicyId?: number;
};

type GenerateBalanceOptions = {
  employeeId?: number;
  leaveTypeId?: number;
  forceRecalculate?: boolean;
  /**
   * Generate each employee's balance for the leave cycle containing this
   * date (anniversary/custom years start mid-year), not the given year.
   */
  asOfDate?: string;
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
    @Optional()
    private readonly leaveStatutoryService?: LeaveStatutoryService,
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
    employee: EmployeeScope,
  ): number {
    const checks = [
      {
        configured: policy.applicable_branch_id != null,
        matches: policy.applicable_branch_id === employee.primary_branch_id,
        weight: 32,
      },
      {
        configured: policy.applicable_department_id != null,
        matches:
          policy.applicable_department_id === employee.primary_department_id,
        weight: 16,
      },
      {
        configured: policy.applicable_position_id != null,
        matches: policy.applicable_position_id === employee.primary_position_id,
        weight: 8,
      },
      {
        configured: policy.applicable_grade_id != null,
        matches: policy.applicable_grade_id === employee.grade_id,
        weight: 4,
      },
      {
        configured: policy.applicable_employment_type != null,
        matches: policy.applicable_employment_type === employee.employment_type,
        weight: 2,
      },
      {
        configured: policy.applicable_confirmation_status != null,
        matches:
          policy.applicable_confirmation_status ===
          employee.confirmation_status,
        weight: 1,
      },
    ];

    for (const check of checks) {
      if (check.configured && !check.matches) {
        return 0;
      }
    }

    return checks.reduce(
      (score, check) =>
        score + (check.configured && check.matches ? check.weight : 0),
      1,
    );
  }

  /**
   * How each current balance is earned: accrual frequency and start (hire
   * date or probation completion), probation status, earned so far and the
   * next credit. One source for the HR screen, self-service and the PDF.
   * Contains no confidential HR configuration beyond what explains the
   * employee's own balance.
   */
  async accrualSummary(
    companyId: number,
    employeeId: number,
    asOf: string = this.todayIso(),
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
    });
    if (!employee) return [];
    const fiscalYear = this.getFiscalYearFromDate(
      new Date(`${asOf}T00:00:00Z`),
    );
    const balances = await this.leaveBalanceRepository.find({
      where: { employee_id: employeeId, fiscal_year: fiscalYear },
      relations: { leave_type: true },
      order: { leave_type_id: 'ASC' },
    });
    const policies = await this.findActivePolicies(companyId);
    return balances
      .filter((balance) => isLeaveBalanceVisibleForEmployee(employee, balance))
      .map((balance) => {
        const assignment = this.selectPolicyAssignment(
          policies,
          employee,
          balance.leave_type_id,
        );
        const accrual = this.effectiveAccrual(assignment);
        const entitlement = this.toNumber(balance.entitlement_days);
        const detail = this.accrualDetail(
          entitlement,
          accrual,
          fiscalYear,
          employee,
          asOf,
          this.toNumber(balance.accrued_days),
        );
        return {
          leave_type_id: balance.leave_type_id,
          leave_type_name: balance.leave_type?.name ?? null,
          fiscal_year: balance.fiscal_year,
          cycle_start: detail.cycle.startDate,
          cycle_end: detail.cycle.endDate,
          entitlement_days: entitlement,
          accrued_days: this.toNumber(balance.accrued_days),
          used_days: this.toNumber(balance.used_days),
          pending_days: this.toNumber(balance.pending_days),
          approved_future_days: this.toNumber(balance.approved_future_days),
          carried_forward_days: this.toNumber(balance.carried_forward_days),
          available_days: this.calculateAvailableDays(balance),
          accrual_frequency: detail.frequency,
          accrual_timing: accrual?.accrual_timing ?? 'in_advance',
          accrual_start_basis: accrual?.accrual_start_basis ?? 'hire_date',
          accrual_start_date: detail.start.date,
          accrual_explanation: detail.start.reason,
          probation_status: detail.start.probation,
          expected_accrual_start_date: detail.start.expected_date,
          next_accrual_date: detail.next_accrual_date,
          next_accrual_amount:
            Math.round(detail.next_accrual_amount * 100) / 100,
          review_pending: !!balance.accrual_review_required_at,
        };
      });
  }

  async resolvePolicyAssignment(
    companyId: number,
    employee: EmployeeScope,
    leaveTypeId: number,
    manager?: EntityManager,
    preferredPolicyId?: number,
  ): Promise<PolicyAssignment | null> {
    const policies = await this.findActivePolicies(companyId, manager);
    const candidates =
      typeof preferredPolicyId === 'number'
        ? policies.filter((policy) => policy.id === preferredPolicyId)
        : policies;
    return this.selectPolicyAssignment(candidates, employee, leaveTypeId);
  }

  /**
   * Policy versions in effect on `asOf` (default today): switched on,
   * approved (active, or superseded later but still covering that date),
   * and within their effective dates. Drafts never apply.
   */
  async findActivePolicies(
    companyId: number,
    manager?: EntityManager,
    asOf: string = new Date().toISOString().slice(0, 10),
  ): Promise<LeavePolicy[]> {
    const policies = await this.getLeavePolicyRepository(manager).find({
      where: {
        company_id: companyId,
        status: LeaveRecordStatusEnum.ACTIVE,
        lifecycle_status: In(['active', 'superseded']),
      },
      relations: {
        leave_types: true,
      },
    });
    return policies.filter((policy) => isPolicyEffectiveOn(policy, asOf));
  }

  /**
   * Picks the applicable policy from an already loaded policy list so bulk
   * callers can resolve many employees without re-querying policies.
   */
  selectPolicyAssignment(
    policies: LeavePolicy[],
    employee: EmployeeScope,
    leaveTypeId: number,
  ): PolicyAssignment | null {
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
      if (
        !selected ||
        priority > selected.priority ||
        (priority === selected.priority &&
          (policy.priority ?? 0) > (selected.policy.priority ?? 0))
      ) {
        selected = {
          priority,
          policy,
          policyType,
          annualQuotaDays,
        };
        continue;
      }

      if (
        priority === selected.priority &&
        (policy.priority ?? 0) === (selected.policy.priority ?? 0)
      ) {
        throw new ConflictException(
          `Multiple leave policies have the same applicability and priority for leave type ${leaveTypeId}. Configure a unique priority before generating or recalculating balances.`,
        );
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

  /**
   * Effective carry-forward rules: the employee's policy (per leave type)
   * when HR configured one there, otherwise the leave type's basic settings.
   */
  resolveCarryForwardPolicy(
    leaveType: Pick<
      LeaveType,
      'is_carry_forward_allowed' | 'max_carry_forward_days'
    >,
    policyType: LeavePolicyType | null | undefined,
  ): CarryForwardPolicy {
    if (policyType?.carry_forward_enabled != null) {
      return {
        enabled: policyType.carry_forward_enabled,
        maxDays:
          policyType.carry_forward_max_days == null
            ? null
            : this.toNumber(policyType.carry_forward_max_days),
        expiryMonths: policyType.carry_forward_expiry_months,
        expiryDate: policyType.carry_forward_expiry_date,
        autoExpire: policyType.carry_forward_auto_expire,
        consumeFirst: policyType.carry_forward_consume_first,
        method: policyType.carry_forward_method ?? undefined,
        percentage:
          policyType.carry_forward_percentage == null
            ? null
            : this.toNumber(policyType.carry_forward_percentage),
      };
    }
    return {
      enabled: leaveType.is_carry_forward_allowed,
      maxDays:
        leaveType.max_carry_forward_days == null
          ? null
          : this.toNumber(leaveType.max_carry_forward_days),
      expiryMonths: null,
      expiryDate: null,
      autoExpire: true,
      consumeFirst: true,
    };
  }

  /** Date carried-forward days into `leaveYear` expire, or null. */
  /**
   * When unused carried-forward days expire. `cycleStart` is the first day
   * of the leave year the days were carried into (calendar: 1 Jan;
   * anniversary/custom: the cycle start); defaults to 1 Jan of leaveYear.
   * A fixed MM-DD expiry is its first occurrence on/after the cycle start;
   * "N months" ends on the last day of the Nth month of the cycle.
   */
  carryForwardExpiryDate(
    rules: CarryForwardPolicy,
    leaveYear: string,
    cycleStart?: string | null,
  ): string | null {
    const start = cycleStart?.slice(0, 10) || `${leaveYear}-01-01`;
    const year = Number(start.slice(0, 4));
    if (rules.expiryDate) {
      const sameYear = `${year}-${rules.expiryDate}`;
      return sameYear >= start ? sameYear : `${year + 1}-${rules.expiryDate}`;
    }
    if (rules.expiryMonths) {
      const month = Number(start.slice(5, 7)) - 1;
      const end = new Date(Date.UTC(year, month + rules.expiryMonths, 0));
      return end.toISOString().slice(0, 10);
    }
    return null;
  }

  private calculateCarryForwardDays(
    previousBalance: LeaveBalance | null,
    leaveType: LeaveType,
    assignment: PolicyAssignment | null,
    employee: EmployeeScope,
  ): number {
    return this.yearEndSplit(previousBalance, leaveType, assignment, employee)
      .carried;
  }

  /**
   * How last year's unused days split at year end: `carried` into the new
   * year (capped by the carry-forward rules) and `lapsed` (the rest).
   */
  yearEndSplit(
    previousBalance: LeaveBalance | null,
    leaveType: LeaveType,
    assignment: PolicyAssignment | null,
    employee: EmployeeScope,
  ): { remaining: number; carried: number; lapsed: number } {
    if (!previousBalance) return { remaining: 0, carried: 0, lapsed: 0 };
    const remaining = Math.max(
      0,
      this.yearEndRemainingDays(previousBalance, assignment, employee),
    );
    const rules = this.resolveCarryForwardPolicy(
      leaveType,
      assignment?.policyType,
    );
    const byCarryRules = carryForwardDaysFor(remaining, rules);
    // Maximum accumulation caps what can be held at the start of the new
    // year: carried days plus this year's entitlement. The excess lapses.
    const maxAccumulation = this.maximumAccumulationDays(assignment);
    const carried =
      maxAccumulation === null
        ? byCarryRules
        : Math.min(
            byCarryRules,
            Math.max(
              0,
              roundLeaveDays(
                maxAccumulation - (assignment?.annualQuotaDays ?? 0),
              ),
            ),
          );
    return {
      remaining,
      carried,
      lapsed: roundLeaveDays(remaining - carried),
    };
  }

  /**
   * The policy's maximum accumulation (leave type row first, then the
   * policy); null when not set or zero.
   */
  maximumAccumulationDays(
    assignment: Pick<PolicyAssignment, 'policy' | 'policyType'> | null,
  ): number | null {
    const value = this.toNumber(
      assignment?.policyType?.maximum_accumulation_days ??
        assignment?.policy?.maximum_accumulation_days,
    );
    return value > 0 ? value : null;
  }

  private yearEndRemainingDays(
    previousBalance: LeaveBalance,
    assignment: PolicyAssignment | null,
    employee: EmployeeScope,
  ): number {
    // Accruing policies: last year's remainder uses its full-year accrual,
    // even if the daily recalculation did not run on 31 December.
    const accrual = this.effectiveAccrual(assignment);
    const previousAccrued = this.isAccruingPolicy(accrual)
      ? this.accruedDaysAsOf(
          this.toNumber(previousBalance.entitlement_days),
          accrual,
          previousBalance.fiscal_year,
          employee,
          previousBalance.leave_year_end_date ??
            this.cycleForLabel(accrual, previousBalance.fiscal_year, employee)
              .endDate,
        )
      : null;
    const remaining = this.calculateAvailableDays(
      previousAccrued === null
        ? previousBalance
        : ({
            ...previousBalance,
            accrued_days: this.toDecimal(previousAccrued),
          } as LeaveBalance),
    );
    return remaining;
  }

  private calculateAccruedDays(
    entitlementDays: number,
    assignment: PolicyAssignment | null,
    fiscalYear: string,
    employee: EmployeeScope,
    existingAccruedDays: number,
    asOf: string = this.todayIso(),
  ): number {
    return this.accrualDetail(
      entitlementDays,
      this.effectiveAccrual(assignment),
      fiscalYear,
      employee,
      asOf,
      existingAccruedDays,
    ).accrued;
  }

  /** Company-calendar "today" (APP_TIMEZONE), not the UTC date. */
  todayIso(now: Date = new Date()): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: process.env.APP_TIMEZONE || 'Africa/Dar_es_Salaam',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
    } catch {
      return now.toISOString().slice(0, 10);
    }
  }

  /**
   * Full accrual picture for one leave year: earned so far, accrual start
   * (hire date or probation completion), next credit. Used by balances,
   * dashboards, the leave form and recalculation, so they always agree.
   */
  accrualDetail(
    entitlementDays: number,
    policy: AccrualConfig | null,
    fiscalYear: string,
    employee: EmployeeScope,
    asOf: string,
    existingAccruedDays = 0,
  ): AccrualResult & {
    frequency: AccrualFrequency;
    start: AccrualStart;
    cycle: LeaveCycle;
  } {
    const frequency = (policy?.accrual_method ??
      LeaveAccrualMethodEnum.YEARLY) as AccrualFrequency;
    const cycle = this.cycleForLabel(policy, fiscalYear, employee);
    const start = resolveAccrualStart(
      employee,
      policy?.accrual_start_basis ?? 'hire_date',
    );
    // Original behaviour for yearly hire-date policies: the whole quota
    // from the cycle start, whatever the hire date. Kept so existing
    // balances do not move unless HR changes the policy or recalculates.
    const legacyUpfront =
      frequency === 'yearly' &&
      (policy?.accrual_start_basis ?? 'hire_date') === 'hire_date' &&
      (policy?.accrual_timing ?? 'in_advance') === 'in_advance' &&
      !policy?.accrual_prorate;
    const result = computeAccrual({
      frequency,
      entitlementDays,
      cycleStart: cycle.startDate,
      cycleEnd: cycle.endDate,
      // No hire date on a hire-date policy: accrue from the cycle start, as
      // before. A missing confirmation never starts probation-based accrual.
      accrualStart: legacyUpfront
        ? cycle.startDate
        : (start.date ??
          ((policy?.accrual_start_basis ?? 'hire_date') === 'hire_date'
            ? cycle.startDate
            : null)),
      accrualEnd: legacyUpfront ? null : (employee.exit_date ?? null),
      asOf,
      timing: policy?.accrual_timing ?? 'in_advance',
      monthlyRate: this.toNumber(policy?.accrual_rate ?? null) || null,
      prorate: policy?.accrual_prorate ?? false,
      existingAccruedDays,
    });
    return { ...result, frequency, start, cycle };
  }

  /**
   * Accrued days for a leave year as of a date, under the policy's accrual
   * method. YEARLY/MANUAL return the full entitlement (nothing accrues later).
   */
  /**
   * The policy's accrual method, overridden per leave type when HR set one
   * (e.g. daily pro-rata annual leave while other types stay yearly).
   */
  effectiveAccrual(
    assignment: Pick<PolicyAssignment, 'policy' | 'policyType'> | null,
  ): AccrualConfig | null {
    if (!assignment?.policy) return null;
    return {
      accrual_method:
        assignment.policyType?.accrual_method ??
        assignment.policy.accrual_method,
      accrual_rate: assignment.policy.accrual_rate,
      accrual_start_basis:
        assignment.policyType?.accrual_start_basis ?? 'hire_date',
      accrual_timing: assignment.policyType?.accrual_timing ?? 'in_advance',
      accrual_prorate: assignment.policyType?.accrual_prorate ?? false,
      leave_year_type: assignment.policy.leave_year_type,
      leave_year_start_month: assignment.policy.leave_year_start_month,
      leave_year_start_day: assignment.policy.leave_year_start_day,
    };
  }

  /**
   * The leave cycle a balance year covers for this employee: calendar year,
   * employment anniversary or a custom start date, per the policy.
   */
  cycleForLabel(
    config: LeaveCycleConfig | null | undefined,
    label: string,
    employee: Pick<EmployeeScope, 'hire_date'>,
  ): LeaveCycle {
    return leaveCycleForLabel(config, label, employee.hire_date ?? null);
  }

  /** The leave cycle (and so the balance year) that contains `date`. */
  cycleForDate(
    config: LeaveCycleConfig | null | undefined,
    date: string,
    employee: Pick<EmployeeScope, 'hire_date'>,
  ): LeaveCycle {
    return leaveCycleForDate(config, date, employee.hire_date ?? null);
  }

  accruedDaysAsOf(
    entitlementDays: number,
    policy: AccrualConfig | null,
    fiscalYear: string,
    employee: EmployeeScope,
    asOf: string,
  ): number {
    return this.accrualDetail(
      entitlementDays,
      policy,
      fiscalYear,
      employee,
      asOf,
      entitlementDays,
    ).accrued;
  }

  isAccruingPolicy(policy: AccrualConfig | null | undefined): boolean {
    const method = policy?.accrual_method;
    if (
      method === LeaveAccrualMethodEnum.DAILY ||
      method === LeaveAccrualMethodEnum.WEEKLY ||
      method === LeaveAccrualMethodEnum.MONTHLY
    )
      return true;
    // Yearly credits that depend on dates also accrue (not a fixed quota).
    return (
      method === LeaveAccrualMethodEnum.YEARLY &&
      (policy?.accrual_start_basis === 'probation_completion' ||
        policy?.accrual_timing === 'in_arrears' ||
        !!policy?.accrual_prorate)
    );
  }

  private async summarizeLeaveUsage(
    employeeId: number,
    leaveTypeId: number,
    fiscalYear: string,
    manager?: EntityManager,
    cycle?: LeaveCycle,
  ): Promise<{ usedDays: number; pendingDays: number }> {
    const { startDate, endDate } =
      cycle ?? this.getFiscalYearBounds(fiscalYear);
    const requests = await this.getLeaveRequestRepository(manager).find({
      where: {
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
      },
      select: [
        'status',
        'total_days',
        'start_date',
        'end_date',
        'calculation_snapshot',
      ],
    });

    let usedDays = 0;
    let pendingDays = 0;

    for (const request of requests) {
      const overlapStart =
        request.start_date > startDate ? request.start_date : startDate;
      const overlapEnd =
        request.end_date < endDate ? request.end_date : endDate;
      if (overlapStart > overlapEnd) {
        continue;
      }

      const totalDays = this.getRequestDaysWithinRange(
        request,
        overlapStart,
        overlapEnd,
      );
      if (request.status === LeaveStatusEnum.APPROVED) {
        usedDays += totalDays;
        continue;
      }

      if (
        request.status === LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER ||
        request.status === LeaveStatusEnum.PENDING_HR ||
        request.status === LeaveStatusEnum.IN_REVIEW
      ) {
        pendingDays += totalDays;
      }
    }

    return { usedDays, pendingDays };
  }

  /**
   * Approved leave of this type taken in the balance's leave year strictly
   * before `beforeDate`, excluding `excludeRequestId` (the request being
   * printed). Uses the same per-date counting as `used_days` (snapshot
   * included dates → weekends, holidays and half-days already applied), so an
   * earlier leave overlapping `beforeDate` contributes only its earlier days.
   * Rejected, cancelled, draft and pending requests never count.
   */
  async summarizeTakenBefore(
    balance: Pick<
      LeaveBalance,
      | 'employee_id'
      | 'leave_type_id'
      | 'fiscal_year'
      | 'leave_year_start_date'
      | 'leave_year_end_date'
    >,
    beforeDate: string,
    excludeRequestId: number | null,
    manager?: EntityManager,
  ): Promise<number> {
    const bounds =
      balance.leave_year_start_date && balance.leave_year_end_date
        ? {
            startDate: String(balance.leave_year_start_date),
            endDate: String(balance.leave_year_end_date),
          }
        : this.getFiscalYearBounds(balance.fiscal_year);
    const dayBefore = new Date(`${beforeDate}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const lastDay = dayBefore.toISOString().slice(0, 10);
    const toDate = lastDay < bounds.endDate ? lastDay : bounds.endDate;
    if (toDate < bounds.startDate) return 0;

    const requests = await this.getLeaveRequestRepository(manager).find({
      where: {
        employee_id: balance.employee_id,
        leave_type_id: balance.leave_type_id,
        status: LeaveStatusEnum.APPROVED,
      },
      select: [
        'id',
        'total_days',
        'start_date',
        'end_date',
        'calculation_snapshot',
        'requested_minutes',
      ],
    });
    let days = 0;
    for (const request of requests) {
      if (request.id === excludeRequestId) continue;
      const from =
        request.start_date > bounds.startDate
          ? request.start_date
          : bounds.startDate;
      const to = request.end_date < toDate ? request.end_date : toDate;
      if (from > to) continue;
      days += this.getRequestDaysWithinRange(request, from, to);
    }
    return roundLeaveDays(days);
  }

  /**
   * Splits the balance's net adjustments into deductions and credits without
   * changing any record. Deductions (positive quantities): expired days,
   * attendance deductions, manual/imported adjustments that reduced the
   * balance, and encashed days not reversed. Credits: retained days and
   * adjustments that increased it. `deductions − credits` reconciles with the
   * ledger's `expired + attendance − retained − adjusted`.
   */
  async summarizeAdjustmentBreakdown(
    balance: LeaveBalance,
    manager?: EntityManager,
  ): Promise<{ deductionDays: number; creditDays: number }> {
    const n = (v: unknown) => this.toNumber((v as string | null) ?? '0');
    let adjustmentDecreases = 0;
    let encashedNet = 0;
    if (balance.id) {
      const adjustments = await this.getLeaveBalanceAdjustmentRepository(
        manager,
      ).find({
        where: { leave_balance_id: balance.id },
        select: ['id', 'adjustment_amount_days'],
      });
      for (const a of adjustments) {
        const amount = n(a.adjustment_amount_days);
        if (amount < 0) adjustmentDecreases += -amount;
      }
      const transactions = await (
        manager ?? this.leaveBalanceRepository.manager
      )
        .getRepository(LeaveBalanceTransaction)
        .find({
          where: {
            leave_balance_id: balance.id,
            transaction_type: In([
              LeaveBalanceTransactionTypeEnum.ENCASHMENT,
              LeaveBalanceTransactionTypeEnum.CANCELLED_REVERSAL,
            ]),
          },
          select: ['id', 'transaction_type', 'amount_days', 'metadata'],
        });
      // Encashment is −days; its reversal is a CANCELLED_REVERSAL (+days)
      // tagged with the encashment request (leave cancellations are not).
      encashedNet = Math.max(
        0,
        -transactions
          .filter(
            (t) =>
              t.transaction_type ===
                LeaveBalanceTransactionTypeEnum.ENCASHMENT ||
              t.metadata?.encashment_request_id != null,
          )
          .reduce((s, t) => s + n(t.amount_days), 0),
      );
    }
    const deductionDays =
      n(balance.expired_days) +
      n(balance.attendance_deduction_days) +
      adjustmentDecreases +
      encashedNet;
    // Whatever the net adjusted figure holds beyond the known decreases is
    // credit (covers rows written before adjustments were itemised).
    const creditDays = Math.max(
      0,
      n(balance.retained_days) +
        n(balance.adjusted_days) +
        adjustmentDecreases +
        encashedNet,
    );
    return {
      deductionDays: roundLeaveDays(deductionDays),
      creditDays: roundLeaveDays(creditDays),
    };
  }

  private getRequestDaysWithinRange(
    request: Pick<
      LeaveRequest,
      | 'total_days'
      | 'start_date'
      | 'end_date'
      | 'calculation_snapshot'
      | 'requested_minutes'
    >,
    fromDate: string,
    toDate: string,
  ): number {
    const snapshot = request.calculation_snapshot as {
      included_dates?: unknown;
      duration_type?: string;
      working_day_minutes?: number;
    } | null;
    if (Array.isArray(snapshot?.included_dates)) {
      const included = snapshot.included_dates.filter(
        (date): date is string =>
          typeof date === 'string' && date >= fromDate && date <= toDate,
      );
      if (included.length === 0) return 0;
      if (included.length > 0) {
        const requestedMinutes = Number(request.requested_minutes);
        if (snapshot.duration_type === 'SHORT_LEAVE' && requestedMinutes > 0) {
          const workingMinutes = Number(snapshot.working_day_minutes) || 480;
          return Math.min(
            requestedMinutes / workingMinutes,
            this.toNumber(request.total_days),
          );
        }
        if (snapshot.duration_type === 'HALF_DAY') return 0.5;
        return Math.min(included.length, this.toNumber(request.total_days));
      }
    }
    // Historical rows without a calculation snapshot cannot be safely prorated
    // by calendar days (weekends/holidays may be excluded). Keep their total in
    // the year their request starts; flag them for migration/reconciliation.
    return request.start_date >= fromDate && request.start_date <= toDate
      ? this.toNumber(request.total_days)
      : 0;
  }

  private async calculateAttendanceDeductionDays(
    companyId: number,
    employeeId: number,
    leaveType: LeaveType,
    fiscalYear: string,
    assignment: PolicyAssignment | null,
    manager?: EntityManager,
    cycle?: LeaveCycle,
  ): Promise<number> {
    if (
      leaveType.code !== 'ANNUAL' ||
      !assignment?.policy.attendance_balance_deduction_enabled
    ) {
      return 0;
    }

    const { startDate, endDate } =
      cycle ?? this.getFiscalYearBounds(fiscalYear);
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
    preferredPolicyId?: number,
    accrualOptions: Pick<
      EnsureBalanceOptions,
      | 'allowAccrualDecrease'
      | 'recalculationRunId'
      | 'actorCompanyUserId'
      | 'asOfDate'
    > = {},
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

    // A leave year closed by a posted rollover is final: nightly runs and
    // policy changes must not move it. Corrections go through adjustments.
    if (balance.id && balance.closed_at) {
      return balance;
    }

    const assignment = await this.resolvePolicyAssignment(
      companyId,
      employee,
      leaveTypeId,
      manager,
      preferredPolicyId,
    );
    const policyEntitlementDays =
      assignment?.annualQuotaDays ?? this.toNumber(leaveType.max_days_per_year);
    // Company policy may give more than the law, never less: an active
    // statutory annual-leave rule for this leave type sets the floor.
    const statutoryMinimum = this.leaveStatutoryService
      ? await this.leaveStatutoryService.annualMinimum(
          companyId,
          { ...employee, company_id: companyId },
          leaveTypeId,
          this.cycleForLabel(
            this.effectiveAccrual(assignment),
            normalizedFiscalYear,
            employee,
          ).endDate < new Date().toISOString().slice(0, 10)
            ? this.cycleForLabel(
                this.effectiveAccrual(assignment),
                normalizedFiscalYear,
                employee,
              ).endDate
            : new Date().toISOString().slice(0, 10),
          manager,
        )
      : null;
    const entitlementDays =
      statutoryMinimum && statutoryMinimum.days > policyEntitlementDays
        ? statutoryMinimum.days
        : policyEntitlementDays;

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
    // A posted rollover fixes the carried amount; until then it is an
    // estimate from last year's balance and the current carry-forward rules.
    const carriedForwardDays =
      balance.carry_forward_locked_days !== null &&
      balance.carry_forward_locked_days !== undefined
        ? this.toNumber(balance.carry_forward_locked_days)
        : this.calculateCarryForwardDays(
            previousBalance,
            leaveType,
            assignment,
            employee,
          );
    const cycle = this.cycleForLabel(
      this.effectiveAccrual(assignment),
      normalizedFiscalYear,
      employee,
    );
    const usage = await this.summarizeLeaveUsage(
      employee.id,
      leaveTypeId,
      normalizedFiscalYear,
      manager,
      cycle,
    );
    const attendanceDeductionDays = await this.calculateAttendanceDeductionDays(
      companyId,
      employee.id,
      leaveType,
      normalizedFiscalYear,
      assignment,
      manager,
      cycle,
    );
    const maxAccumulation = this.maximumAccumulationDays(assignment);
    const uncappedAccruedDays = this.calculateAccruedDays(
      entitlementDays,
      assignment,
      normalizedFiscalYear,
      employee,
      this.toNumber(balance.accrued_days),
      accrualOptions.asOfDate,
    );
    // A quota above the maximum accumulation can never be held in full.
    const computedAccruedDays =
      maxAccumulation === null
        ? uncappedAccruedDays
        : Math.min(uncappedAccruedDays, maxAccumulation);
    // Routine refreshes only ever add earned days. A lower figure (policy
    // change, probation correction, exit) is held until HR reviews and
    // applies it through a balance recalculation run.
    const storedAccruedDays =
      balance.id && balance.accrued_days != null
        ? this.toNumber(balance.accrued_days)
        : null;
    const holdDecrease =
      storedAccruedDays !== null &&
      computedAccruedDays < storedAccruedDays - 0.005 &&
      !accrualOptions.allowAccrualDecrease;
    const accruedDays = holdDecrease ? storedAccruedDays : computedAccruedDays;
    // Flag for the daily review job, which opens a recalculation preview.
    balance.accrual_review_required_at = holdDecrease
      ? (balance.accrual_review_required_at ?? new Date())
      : null;

    balance.allocated_days = this.toDecimal(entitlementDays);
    balance.company_id = companyId;
    balance.policy_id = assignment?.policy.id ?? null;
    balance.policy_type_id = assignment?.policyType.id ?? null;
    balance.opening_balance_days = this.toDecimal(carriedForwardDays);
    balance.entitlement_days = this.toDecimal(entitlementDays);
    balance.accrued_days = this.toDecimal(accruedDays);
    balance.used_days = this.toDecimal(usage.usedDays);
    balance.pending_days = this.toDecimal(usage.pendingDays);
    balance.approved_future_days =
      balance.approved_future_days ?? this.toDecimal(0);
    balance.carried_forward_days = this.toDecimal(carriedForwardDays);
    balance.expired_days = balance.expired_days ?? this.toDecimal(0);
    balance.adjusted_days = balance.adjusted_days ?? this.toDecimal(0);
    balance.attendance_deduction_days = this.toDecimal(attendanceDeductionDays);
    balance.generated_at = balance.generated_at ?? new Date();
    balance.leave_year_start_date = cycle.startDate;
    balance.leave_year_end_date = cycle.endDate;
    balance.version = balance.version ?? 1;

    const saved = await balanceRepository.save(balance);
    if (
      storedAccruedDays !== null &&
      Math.abs(this.toNumber(saved.accrued_days) - storedAccruedDays) >= 0.005
    )
      await this.postAccrualMovement(
        saved,
        storedAccruedDays,
        this.toNumber(saved.accrued_days),
        accrualOptions,
        manager,
      );
    return saved;
  }

  /**
   * Ledger row for a change in accrued days (traceable source for every
   * credit/debit). Idempotent: the same change on the same day is written
   * once, so overlapping or repeated jobs cannot post it twice.
   */
  private async postAccrualMovement(
    balance: LeaveBalance,
    before: number,
    after: number,
    options: Pick<
      EnsureBalanceOptions,
      'recalculationRunId' | 'actorCompanyUserId'
    >,
    manager?: EntityManager,
  ): Promise<void> {
    const today = this.todayIso();
    const delta = after - before;
    const available = this.calculateAvailableDays(balance);
    const runId = options.recalculationRunId ?? null;
    const repo = (manager ?? this.leaveBalanceRepository.manager).getRepository(
      LeaveBalanceTransaction,
    );
    await repo
      .createQueryBuilder()
      .insert()
      .values({
        company_id: balance.company_id ?? undefined,
        employee_id: balance.employee_id,
        leave_type_id: balance.leave_type_id,
        leave_balance_id: balance.id,
        ...(runId ? { recalculation_run_id: runId } : {}),
        transaction_type: runId
          ? LeaveBalanceTransactionTypeEnum.RECALCULATION
          : LeaveBalanceTransactionTypeEnum.ACCRUAL,
        leave_year: balance.fiscal_year,
        effective_date: today,
        previous_balance_days: this.toDecimal(available - delta),
        amount_days: this.toDecimal(delta),
        new_balance_days: this.toDecimal(available),
        previous_pending_days: balance.pending_days,
        pending_delta_days: this.toDecimal(0),
        new_pending_days: balance.pending_days,
        previous_used_days: balance.used_days,
        used_delta_days: this.toDecimal(0),
        new_used_days: balance.used_days,
        reason: runId
          ? `Balance recalculation run #${runId}: accrued ${before.toFixed(2)} → ${after.toFixed(2)}`
          : `Accrual: accrued ${before.toFixed(2)} → ${after.toFixed(2)}`,
        idempotency_key: runId
          ? `recalc:${runId}:${balance.id}`
          : `accrual:${balance.id}:${today}:${after.toFixed(2)}`,
        metadata: { accrued_before: before, accrued_after: after },
        created_by_company_user_id: options.actorCompanyUserId ?? null,
      })
      .orIgnore()
      .execute();
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
    // Inside a transaction the row is locked for the read-modify-write, so a
    // recalculation cannot overwrite a concurrent adjustment with stale values.
    const existing = await balanceRepository.findOne({
      where: {
        employee_id: employee.id,
        leave_type_id: leaveTypeId,
        fiscal_year: normalizedFiscalYear,
      },
      ...(manager?.queryRunner?.isTransactionActive
        ? { lock: { mode: 'pessimistic_write' as const } }
        : {}),
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
      options?.preferredPolicyId,
      {
        allowAccrualDecrease: options?.allowAccrualDecrease,
        recalculationRunId: options?.recalculationRunId,
        actorCompanyUserId: options?.actorCompanyUserId,
        asOfDate: options?.asOfDate,
      },
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

    // Without a specific type, only create balances for types the employee's
    // gender is eligible for (all types when no gender is recorded).
    const filteredLeaveTypes =
      typeof leaveTypeId === 'number'
        ? leaveTypes.filter((item) => item.id === leaveTypeId)
        : leaveTypes.filter((item) =>
            isEmployeeEligibleForLeaveType(employee, item),
          );

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

  /**
   * Locks all of an employee's balances for the year up front, in primary-key
   * order, before recalculating them one by one. Bulk imports lock in the same
   * order, so the two writers queue behind each other instead of deadlocking
   * or overwriting each other's changes.
   */
  private async lockEmployeeYearBalances(
    employeeId: number,
    fiscalYear: string,
    manager: EntityManager,
  ): Promise<void> {
    await this.getBalanceRepository(manager).find({
      where: { employee_id: employeeId, fiscal_year: fiscalYear },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
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

    // Scoped by employee.company_id, so employees without a login account
    // get balances too.
    const scopedEmployees =
      typeof options.employeeId === 'number'
        ? await employeeRepository.find({
            where: { id: options.employeeId, company_id: companyId },
          })
        : await employeeRepository.find({
            where: {
              company_id: companyId,
              employment_status: EmploymentStatusEnum.ACTIVE,
            },
          });

    if (typeof options.employeeId === 'number' && !scopedEmployees.length) {
      throw new NotFoundException('Employee not found');
    }

    const cyclePolicies = options.asOfDate
      ? await this.findActivePolicies(companyId, manager, options.asOfDate)
      : [];
    const cycleTypeIds = options.asOfDate
      ? (
          await this.getLeaveTypeRepository(manager).find({
            where: {
              company_id: companyId,
              status: LeaveRecordStatusEnum.ACTIVE,
            },
            select: ['id'],
            order: { id: 'ASC' },
          })
        ).map((item) => item.id)
      : [];
    const yearFor = (employee: EmployeeScope): string => {
      if (!options.asOfDate) return normalizedFiscalYear;
      for (const typeId of cycleTypeIds) {
        let assignment: PolicyAssignment | null = null;
        try {
          assignment = this.selectPolicyAssignment(
            cyclePolicies,
            employee,
            typeId,
          );
        } catch {
          assignment = null;
        }
        if (assignment) {
          return this.cycleForDate(
            this.effectiveAccrual(assignment),
            options.asOfDate,
            employee,
          ).label;
        }
      }
      return normalizedFiscalYear;
    };

    let generatedBalances = 0;
    for (const employee of scopedEmployees) {
      const employeeYear = yearFor(employee);
      const balances = manager
        ? await this.ensureBalancesForEmployeeYear(
            companyId,
            employee,
            employeeYear,
            manager,
            options.leaveTypeId,
            options.forceRecalculate ?? false,
          )
        : await this.leaveBalanceRepository.manager.transaction(
            async (employeeManager) => {
              await this.lockEmployeeYearBalances(
                employee.id,
                employeeYear,
                employeeManager,
              );
              return this.ensureBalancesForEmployeeYear(
                companyId,
                employee,
                employeeYear,
                employeeManager,
                options.leaveTypeId,
                options.forceRecalculate ?? false,
              );
            },
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
    return calculateAvailableLeaveDays(balance);
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
      .leftJoinAndSelect('adjustment.import_batch', 'importBatch')
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
