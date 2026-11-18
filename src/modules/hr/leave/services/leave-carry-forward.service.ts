import { openingOrCarriedDays } from '../utils/leave-balance-rules.util';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LeaveLifecycleNotificationEvent } from '../../notifications/events/leave.events';
import { emitLeaveLifecycle } from '../utils/leave-lifecycle-notify.util';

type LifecycleNotice = LeaveLifecycleNotificationEvent['input'];

/** Days before carried-forward leave expires that employees are warned. */
export const CARRY_EXPIRY_WARNING_DAYS = 14;
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveBalanceTransactionTypeEnum } from '../enums/leave-balance-transaction-type.enum';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { roundLeaveDays } from '../utils/leave-accrual.util';
import { LeaveBalanceLedgerService } from './leave-balance-ledger.service';
import { LeaveBalanceService } from './leave-balance.service';

/** First day of the balance's leave cycle (calendar balances: 1 Jan). */
export function cycleStartOf(balance: LeaveBalance): string {
  return balance.leave_year_start_date
    ? String(balance.leave_year_start_date).slice(0, 10)
    : `${balance.fiscal_year}-01-01`;
}

/** Last day of the balance's leave cycle (calendar balances: 31 Dec). */
export function cycleEndOf(balance: LeaveBalance): string {
  return balance.leave_year_end_date
    ? String(balance.leave_year_end_date).slice(0, 10)
    : `${balance.fiscal_year}-12-31`;
}

/**
 * Records carry-forward in the balance history, records last year's unused
 * days that were not carried as LAPSED, and expires unused carried days under
 * the HR-configured carry-forward policy.
 */
@Injectable()
export class LeaveCarryForwardService {
  private readonly logger = new Logger(LeaveCarryForwardService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly ledger: LeaveBalanceLedgerService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  /**
   * Runs after the 01:00 balance regeneration. Processes every balance whose
   * own leave cycle (calendar, anniversary or custom) contains today, so
   * employees on different cycles are handled on their own dates.
   */
  @Cron('30 1 * * *')
  async runDaily(): Promise<void> {
    const leaveYear = undefined;
    const companies = await this.dataSource
      .getRepository(Company)
      .find({ select: ['id'] });
    for (const company of companies) {
      try {
        await this.processCompany(company.id, leaveYear);
      } catch (error) {
        this.logger.error(
          `Carry-forward processing failed for company ${company.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async processCompany(
    companyId: number,
    leaveYear?: string,
    today: string = new Date().toISOString().slice(0, 10),
  ) {
    const query = this.dataSource
      .getRepository(LeaveBalance)
      .createQueryBuilder('b')
      .select('b.id', 'id')
      .where('b.company_id = :companyId', { companyId })
      .andWhere('b.closed_at IS NULL');
    if (leaveYear) {
      query.andWhere('b.fiscal_year = :leaveYear', { leaveYear });
    } else {
      // The balance of the cycle containing today, whatever its type.
      query.andWhere(
        `((b.leave_year_start_date IS NOT NULL AND b.leave_year_start_date <= :today AND b.leave_year_end_date >= :today)
          OR (b.leave_year_start_date IS NULL AND b.fiscal_year = :calendarYear))`,
        { today, calendarYear: today.slice(0, 4) },
      );
    }
    const balances = await query.getRawMany<{ id: number }>();
    let recorded = 0;
    let expired = 0;
    const lapsed = 0; // recorded by posted rollover runs only
    // Year-end lapse is no longer recorded here: unused days lapse only
    // when HR posts a year-end rollover run (LeaveRolloverService), which
    // also protects statutory minimums and retained days.
    for (const { id } of balances) {
      const notices: LifecycleNotice[] = [];
      const result = await this.dataSource.transaction((manager) =>
        this.processBalance(companyId, id, today, manager, notices),
      );
      // Only after the balance transaction committed.
      for (const notice of notices)
        emitLeaveLifecycle(this.eventEmitter, notice);
      if (result.recorded) recorded += 1;
      if (result.expired) expired += 1;
    }
    return {
      leave_year: leaveYear ?? 'current cycle per balance',
      balances_checked: balances.length,
      carry_forward_recorded: recorded,
      carry_forward_expired: expired,
      lapse_recorded: lapsed,
    };
  }

  private async processBalance(
    companyId: number,
    balanceId: number,
    today: string,
    manager: EntityManager,
    notices: LifecycleNotice[] = [],
  ): Promise<{ recorded: boolean; expired: boolean }> {
    const balance = await manager.getRepository(LeaveBalance).findOne({
      where: { id: balanceId, company_id: companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!balance) return { recorded: false, expired: false };
    const toNumber = (value: string | null | undefined) =>
      this.leaveBalanceService.toNumber(value);
    const carried = openingOrCarriedDays(balance);

    // 1. Keep the history in step with the carried-forward amount.
    let recorded = false;
    const alreadyRecorded = roundLeaveDays(
      await this.ledger.sumCarryForwardRecorded(balance, manager),
    );
    const delta = roundLeaveDays(carried - alreadyRecorded);
    if (Math.abs(delta) >= 0.01) {
      await this.ledger.recordBalanceMovement(
        {
          balance,
          companyId,
          transactionType: LeaveBalanceTransactionTypeEnum.CARRY_FORWARD,
          amountDays: delta,
          effectiveDate: cycleStartOf(balance),
          reason: `Carried forward from ${Number(balance.fiscal_year) - 1}`,
          idempotencyKey: `carry-forward:${balance.id}:${alreadyRecorded}->${roundLeaveDays(carried)}`,
          metadata: { carried_forward_days: roundLeaveDays(carried) },
        },
        manager,
      );
      recorded = true;
    }

    // 2. Expire unused carried days once, after the expiry date.
    if (carried <= 0 || toNumber(balance.expired_days) > 0) {
      return { recorded, expired: false };
    }
    const [employee, leaveType] = await Promise.all([
      manager
        .getRepository(Employee)
        .findOne({ where: { id: balance.employee_id, company_id: companyId } }),
      manager.getRepository(LeaveType).findOne({
        where: { id: balance.leave_type_id, company_id: companyId },
      }),
    ]);
    if (!employee || !leaveType) return { recorded, expired: false };
    const assignment = await this.leaveBalanceService.resolvePolicyAssignment(
      companyId,
      employee,
      balance.leave_type_id,
      manager,
    );
    const rules = this.leaveBalanceService.resolveCarryForwardPolicy(
      leaveType,
      assignment?.policyType,
    );
    const expiryDate = this.leaveBalanceService.carryForwardExpiryDate(
      rules,
      balance.fiscal_year,
      cycleStartOf(balance),
    );
    if (rules.autoExpire && expiryDate && today <= expiryDate) {
      const daysLeft = Math.round(
        (Date.parse(`${expiryDate}T00:00:00Z`) -
          Date.parse(`${today}T00:00:00Z`)) /
          86_400_000,
      );
      if (daysLeft <= CARRY_EXPIRY_WARNING_DAYS) {
        const taken = await this.approvedDaysThrough(manager, balance, today);
        const unusedCarried = roundLeaveDays(
          rules.consumeFirst ? Math.max(0, carried - taken) : carried, // conservative: accrual-first may still use them
        );
        if (unusedCarried > 0) {
          notices.push({
            companyId,
            eventKey: 'leave.carry_forward.expiry_approaching',
            title: 'Carried-forward leave expires soon',
            message: `Up to ${unusedCarried} carried-forward leave day(s) will expire on ${expiryDate} if not used.`,
            employeeId: balance.employee_id,
            entityType: 'LEAVE_BALANCE',
            entityId: balance.id,
            actionUrl: '/dashboard/self-service',
            dedupeKey: `leave-balance:${balance.id}:carry-expiry-warning:${expiryDate}`,
            metadata: { expiry_date: expiryDate, carried_days: carried },
          });
        }
      }
    }
    if (!rules.autoExpire || !expiryDate || today <= expiryDate) {
      return { recorded, expired: false };
    }

    const takenByExpiry = await this.approvedDaysThrough(
      manager,
      balance,
      expiryDate,
    );
    const accruedByExpiry = this.leaveBalanceService.accruedDaysAsOf(
      toNumber(balance.entitlement_days),
      this.leaveBalanceService.effectiveAccrual(assignment),
      balance.fiscal_year,
      employee,
      expiryDate,
    );
    // Carried days used before expiry depend on the consumption order.
    const carriedUsed = rules.consumeFirst
      ? Math.min(carried, takenByExpiry)
      : Math.min(carried, Math.max(0, takenByExpiry - accruedByExpiry));
    const toExpire = roundLeaveDays(carried - carriedUsed);
    if (toExpire <= 0) return { recorded, expired: false };

    balance.expired_days = this.leaveBalanceService.toDecimal(toExpire);
    await manager.getRepository(LeaveBalance).save(balance);
    await this.ledger.recordBalanceMovement(
      {
        balance,
        companyId,
        transactionType: LeaveBalanceTransactionTypeEnum.EXPIRED,
        amountDays: -toExpire,
        effectiveDate: expiryDate,
        reason: `Unused carried-forward leave expired on ${expiryDate}`,
        idempotencyKey: `carry-forward-expiry:${balance.id}`,
        metadata: {
          carried_forward_days: roundLeaveDays(carried),
          carried_used_days: roundLeaveDays(carriedUsed),
          consume_carry_forward_first: rules.consumeFirst,
        },
      },
      manager,
    );
    notices.push({
      companyId,
      eventKey: 'leave.balance.forfeited',
      title: 'Carried-forward leave expired',
      message: `${toExpire} unused carried-forward leave day(s) expired on ${expiryDate}.`,
      employeeId: balance.employee_id,
      entityType: 'LEAVE_BALANCE',
      entityId: balance.id,
      actionUrl: '/dashboard/self-service',
      dedupeKey: `leave-balance:${balance.id}:carry-expired`,
    });
    return { recorded, expired: true };
  }

  /**
   * Records, on last year's balance, the unused days that were not carried
   * into this year. History only: balance columns are untouched so the
   * carry-forward calculation is unaffected. Self-correcting: only the
   * difference from what is already recorded is written, so late
   * (backdated) changes to last year adjust the lapse.
   */
  async recordYearEndLapse(
    companyId: number,
    currentBalanceId: number,
    manager: EntityManager,
  ): Promise<boolean> {
    const current = await manager.getRepository(LeaveBalance).findOne({
      where: { id: currentBalanceId, company_id: companyId },
    });
    if (!current) return false;
    const previous = await manager.getRepository(LeaveBalance).findOne({
      where: {
        company_id: companyId,
        employee_id: current.employee_id,
        leave_type_id: current.leave_type_id,
        fiscal_year: String(Number(current.fiscal_year) - 1),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!previous) return false;
    const [employee, leaveType] = await Promise.all([
      manager
        .getRepository(Employee)
        .findOne({ where: { id: current.employee_id, company_id: companyId } }),
      manager.getRepository(LeaveType).findOne({
        where: { id: current.leave_type_id, company_id: companyId },
      }),
    ]);
    if (!employee || !leaveType) return false;
    const assignment = await this.leaveBalanceService.resolvePolicyAssignment(
      companyId,
      employee,
      current.leave_type_id,
      manager,
    );
    const split = this.leaveBalanceService.yearEndSplit(
      previous,
      leaveType,
      assignment,
      employee,
    );
    const target = Math.max(0, split.lapsed);
    const already = roundLeaveDays(
      await this.ledger.sumLapsedRecorded(previous, manager),
    );
    const delta = roundLeaveDays(target - already);
    if (Math.abs(delta) < 0.01) return false;
    await this.ledger.recordBalanceMovement(
      {
        balance: previous,
        companyId,
        transactionType: LeaveBalanceTransactionTypeEnum.LAPSED,
        amountDays: -delta,
        effectiveDate: cycleEndOf(previous),
        reason:
          split.carried > 0
            ? `Unused leave above the carry-forward limit lapsed at the end of ${previous.fiscal_year}`
            : `Unused leave lapsed at the end of ${previous.fiscal_year} (no carry forward)`,
        idempotencyKey: `year-end-lapse:${previous.id}:${already}->${target}`,
        metadata: {
          remaining_days: roundLeaveDays(split.remaining),
          carried_forward_days: roundLeaveDays(split.carried),
          lapsed_days: target,
          carried_into_balance_id: current.id,
        },
      },
      manager,
    );
    return true;
  }

  /** Approved leave days of this type taken from 1 Jan through `date`. */
  private async approvedDaysThrough(
    manager: EntityManager,
    balance: LeaveBalance,
    date: string,
  ): Promise<number> {
    const yearStart = cycleStartOf(balance);
    const requests = await manager
      .getRepository(LeaveRequest)
      .createQueryBuilder('request')
      .where('request.employee_id = :employeeId', {
        employeeId: balance.employee_id,
      })
      .andWhere('request.leave_type_id = :leaveTypeId', {
        leaveTypeId: balance.leave_type_id,
      })
      .andWhere('request.status = :status', {
        status: LeaveStatusEnum.APPROVED,
      })
      .andWhere('request.start_date <= :date', { date })
      .andWhere('request.end_date >= :yearStart', { yearStart })
      .getMany();
    let total = 0;
    for (const request of requests) {
      const snapshot = request.calculation_snapshot as {
        included_dates?: unknown;
        duration_type?: string;
      } | null;
      const dates = Array.isArray(snapshot?.included_dates)
        ? snapshot.included_dates.filter(
            (value): value is string =>
              typeof value === 'string' && value >= yearStart && value <= date,
          )
        : [];
      const days = this.leaveBalanceService.toNumber(request.total_days);
      total += dates.length
        ? Math.min(
            days,
            snapshot?.duration_type === 'HALF_DAY' ? 0.5 : dates.length,
          )
        : days;
    }
    return total;
  }
}
