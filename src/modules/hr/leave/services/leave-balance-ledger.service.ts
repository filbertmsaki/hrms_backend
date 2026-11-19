import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, EntityManager } from 'typeorm';
import { LeaveBalanceAdjustmentModeEnum } from '../enums/leave-balance-adjustment-mode.enum';
import { LeaveBalanceAdjustmentSourceEnum } from '../enums/leave-balance-adjustment-source.enum';
import { LeaveBalanceTransactionTypeEnum } from '../enums/leave-balance-transaction-type.enum';
import { LeaveBalanceAdjustment } from '../entities/leave-balance-adjustment.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveBalanceTransaction } from '../entities/leave-balance-transaction.entity';
import { calculateAvailableLeaveDays } from '../utils/leave-balance-rules.util';
import {
  openingPreviewFingerprint,
  previewLegacyOpeningBalance,
} from '../utils/leave-opening-preview.util';

type LedgerMutationResult = {
  balance: LeaveBalance;
  transaction: LeaveBalanceTransaction;
  created: boolean;
  adjustment?: LeaveBalanceAdjustment | null;
};

type TransactionCreateInput = {
  balance: LeaveBalance;
  companyId: number;
  employeeId: number;
  leaveTypeId: number;
  leaveYear: string;
  effectiveDate: string;
  transactionType: LeaveBalanceTransactionTypeEnum;
  idempotencyKey: string;
  amountDays: number;
  pendingDeltaDays?: number;
  usedDeltaDays?: number;
  leaveRequestId?: number | null;
  accrualRunId?: number | null;
  recalculationRunId?: number | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdByCompanyUserId?: number | null;
  reversedTransactionId?: number | null;
  isReversal?: boolean;
  previousBalanceDays?: number;
};

@Injectable()
export class LeaveBalanceLedgerService {
  constructor(
    @InjectRepository(LeaveBalanceTransaction)
    private readonly transactionRepository: Repository<LeaveBalanceTransaction>,
    @InjectRepository(LeaveBalance)
    private readonly balanceRepository: Repository<LeaveBalance>,
    @InjectRepository(LeaveBalanceAdjustment)
    private readonly adjustmentRepository: Repository<LeaveBalanceAdjustment>,
  ) {}

  private getTransactionRepository(
    manager?: EntityManager,
  ): Repository<LeaveBalanceTransaction> {
    return (
      manager?.getRepository(LeaveBalanceTransaction) ??
      this.transactionRepository
    );
  }

  private getBalanceRepository(
    manager?: EntityManager,
  ): Repository<LeaveBalance> {
    return manager?.getRepository(LeaveBalance) ?? this.balanceRepository;
  }

  private getAdjustmentRepository(
    manager?: EntityManager,
  ): Repository<LeaveBalanceAdjustment> {
    return (
      manager?.getRepository(LeaveBalanceAdjustment) ??
      this.adjustmentRepository
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

  daysForBalanceYear(
    balance: LeaveBalance,
    totalDays: number,
    fallbackYear: string,
    metadata?: Record<string, unknown> | null,
  ): number {
    const snapshot = metadata?.calculation_snapshot as
      | {
          included_dates?: unknown;
          duration_type?: string;
          working_day_minutes?: number;
        }
      | undefined;
    if (!Array.isArray(snapshot?.included_dates)) {
      return balance.fiscal_year === fallbackYear ? totalDays : 0;
    }

    const yearDates = snapshot.included_dates.filter(
      (date): date is string =>
        typeof date === 'string' &&
        (balance.leave_year_start_date && balance.leave_year_end_date
          ? date >= String(balance.leave_year_start_date).slice(0, 10) &&
            date <= String(balance.leave_year_end_date).slice(0, 10)
          : date.startsWith(`${balance.fiscal_year}-`)),
    );
    if (!yearDates.length) return 0;
    if (snapshot.duration_type === 'HALF_DAY') return Math.min(totalDays, 0.5);
    if (snapshot.duration_type === 'SHORT_LEAVE') return totalDays;
    return Math.min(totalDays, yearDates.length);
  }

  /** Available now — the same number the balance screens show. */
  calculateAvailableDays(balance: LeaveBalance): number {
    return calculateAvailableLeaveDays(balance);
  }

  /**
   * Upper bound for a reservation: the balance with the whole year's
   * entitlement counted. Accruing policies are held to the stricter
   * "accrued by the leave's last day" limit before reaching the ledger.
   */
  calculateYearCeilingDays(balance: LeaveBalance): number {
    return calculateAvailableLeaveDays(balance, {
      accruedDays:
        this.toNumber(balance.entitlement_days) ||
        this.toNumber(balance.allocated_days),
    });
  }

  async reconcileBalances(
    companyId: number,
    filters: {
      employeeIds: number[] | null;
      employeeId?: number;
      leaveTypeId?: number;
      fiscalYear: string;
      page: number;
      limit: number;
    },
  ) {
    const { employeeIds, employeeId, leaveTypeId, fiscalYear, page, limit } =
      filters;
    if (employeeIds !== null && employeeIds.length === 0) {
      return {
        data: [],
        meta: { page, limit, total: 0, totalPages: 0 },
      };
    }
    const balanceQb = this.balanceRepository
      .createQueryBuilder('balance')
      .leftJoinAndSelect('balance.employee', 'employee')
      .leftJoinAndSelect('balance.leave_type', 'leaveType')
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('balance.fiscal_year = :fiscalYear', { fiscalYear });
    if (employeeIds?.length)
      balanceQb.andWhere('balance.employee_id IN (:...employeeIds)', {
        employeeIds,
      });
    if (typeof employeeId === 'number')
      balanceQb.andWhere('balance.employee_id = :employeeId', { employeeId });
    if (typeof leaveTypeId === 'number')
      balanceQb.andWhere('balance.leave_type_id = :leaveTypeId', {
        leaveTypeId,
      });

    const [balances, total] = await balanceQb
      .orderBy('employee.last_name', 'ASC')
      .addOrderBy('employee.first_name', 'ASC')
      .addOrderBy('leaveType.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    if (!balances.length) {
      return {
        data: [],
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    const balanceIdsOnPage = balances.map((balance) => balance.id);
    const transactionRows = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('transaction.employee_id', 'employee_id')
      .addSelect('transaction.leave_type_id', 'leave_type_id')
      .addSelect('SUM(transaction.used_delta_days)', 'used_days')
      .addSelect('SUM(transaction.pending_delta_days)', 'pending_days')
      .addSelect(
        // An encashment reversal restores adjusted_days, so it counts here too.
        "SUM(CASE WHEN transaction.transaction_type IN ('ADJUSTMENT', 'ENCASHMENT', 'MANUAL_CORRECTION') OR (transaction.transaction_type = 'CANCELLED_REVERSAL' AND transaction.metadata ->> 'encashment_request_id' IS NOT NULL) THEN transaction.amount_days ELSE 0 END)",
        'adjusted_days',
      )
      .addSelect('COUNT(transaction.id)', 'transaction_count')
      .where('transaction.company_id = :companyId', { companyId })
      .andWhere('transaction.leave_year = :fiscalYear', { fiscalYear })
      .andWhere('transaction.leave_balance_id IN (:...balanceIds)', {
        balanceIds: balanceIdsOnPage,
      })
      .groupBy('transaction.employee_id')
      .addGroupBy('transaction.leave_type_id')
      .getRawMany<{
        employee_id: string;
        leave_type_id: string;
        used_days: string;
        pending_days: string;
        adjusted_days: string;
        transaction_count: string;
      }>();
    const txByKey = new Map(
      transactionRows.map((row) => [
        `${row.employee_id}:${row.leave_type_id}`,
        row,
      ]),
    );

    const data = balances.map((balance) => {
      const tx = txByKey.get(`${balance.employee_id}:${balance.leave_type_id}`);
      const transactionCount = Number(tx?.transaction_count ?? 0);
      const checks = {
        // Same formula as the employee portal; string decimals such as
        // "0.00" are truthy, so field fallbacks must not use ||.
        available: calculateAvailableLeaveDays(balance),
        ledger_used: this.toNumber(tx?.used_days),
        ledger_pending: this.toNumber(tx?.pending_days),
        ledger_adjusted: this.toNumber(tx?.adjusted_days),
      };
      const differences = {
        used_days: this.toNumber(balance.used_days) - checks.ledger_used,
        pending_days:
          this.toNumber(balance.pending_days) - checks.ledger_pending,
        adjusted_days:
          this.toNumber(balance.adjusted_days) - checks.ledger_adjusted,
      };
      const hasLedger = transactionCount > 0;
      const mismatch =
        hasLedger &&
        Object.values(differences).some((value) => Math.abs(value) >= 0.01);
      return {
        balance_id: balance.id,
        employee_id: balance.employee_id,
        employee_name: [
          balance.employee?.preferred_name || balance.employee?.first_name,
          balance.employee?.last_name,
        ]
          .filter(Boolean)
          .join(' '),
        employee_no: balance.employee?.employee_no ?? null,
        leave_type_id: balance.leave_type_id,
        leave_type: balance.leave_type?.name ?? null,
        fiscal_year: balance.fiscal_year,
        available_days: checks.available.toFixed(2),
        balance_used_days: this.toNumber(balance.used_days).toFixed(2),
        ledger_used_days: checks.ledger_used.toFixed(2),
        balance_pending_days: this.toNumber(balance.pending_days).toFixed(2),
        ledger_pending_days: checks.ledger_pending.toFixed(2),
        balance_adjusted_days: this.toNumber(balance.adjusted_days).toFixed(2),
        ledger_adjusted_days: checks.ledger_adjusted.toFixed(2),
        transaction_count: transactionCount,
        opening_balance_preview: previewLegacyOpeningBalance(balance),
        opening_preview_fingerprint: openingPreviewFingerprint(balance),
        status: !hasLedger
          ? 'legacy_no_ledger'
          : mismatch
            ? 'mismatch'
            : 'reconciled',
        differences: Object.fromEntries(
          Object.entries(differences).map(([key, value]) => [
            key,
            value.toFixed(2),
          ]),
        ),
      };
    });
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private getLeaveYearBounds(leaveYear: string): {
    startDate: string;
    endDate: string;
  } {
    return {
      startDate: `${leaveYear}-01-01`,
      endDate: `${leaveYear}-12-31`,
    };
  }

  private applyBalanceMetadata(
    balance: LeaveBalance,
    companyId: number,
    leaveYear: string,
  ): void {
    const bounds = this.getLeaveYearBounds(leaveYear);
    balance.company_id = companyId;
    balance.leave_year_start_date =
      balance.leave_year_start_date ?? bounds.startDate;
    balance.leave_year_end_date = balance.leave_year_end_date ?? bounds.endDate;
    balance.generated_at = balance.generated_at ?? new Date();
    balance.version = (balance.version ?? 1) + 1;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      typeof (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === 'string' &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    );
  }

  private async createTransaction(
    input: TransactionCreateInput,
    manager?: EntityManager,
  ): Promise<LedgerMutationResult> {
    const transactionRepository = this.getTransactionRepository(manager);
    const balanceRepository = this.getBalanceRepository(manager);

    const existing = await transactionRepository.findOne({
      where: {
        company_id: input.companyId,
        idempotency_key: input.idempotencyKey,
      },
    });

    if (existing) {
      const currentBalance =
        (input.balance.id
          ? await balanceRepository.findOne({ where: { id: input.balance.id } })
          : null) ?? input.balance;

      return {
        balance: currentBalance,
        transaction: existing,
        created: false,
      };
    }

    const previousBalanceDays =
      input.previousBalanceDays ?? this.calculateAvailableDays(input.balance);
    const previousPendingDays = this.toNumber(input.balance.pending_days);
    const previousUsedDays = this.toNumber(input.balance.used_days);

    const nextPendingDays = previousPendingDays + (input.pendingDeltaDays ?? 0);
    const nextUsedDays = previousUsedDays + (input.usedDeltaDays ?? 0);
    const normalizedPendingDays = Math.max(0, nextPendingDays);
    const normalizedUsedDays = Math.max(0, nextUsedDays);
    const normalizedPendingDelta = normalizedPendingDays - previousPendingDays;
    const normalizedUsedDelta = normalizedUsedDays - previousUsedDays;
    const nextBalanceDays = previousBalanceDays + input.amountDays;

    const transaction = transactionRepository.create({
      company_id: input.companyId,
      employee_id: input.employeeId,
      leave_type_id: input.leaveTypeId,
      leave_balance_id: input.balance.id ?? null,
      leave_request_id: input.leaveRequestId ?? null,
      accrual_run_id: input.accrualRunId ?? null,
      recalculation_run_id: input.recalculationRunId ?? null,
      transaction_type: input.transactionType,
      leave_year: input.leaveYear,
      effective_date: input.effectiveDate,
      previous_balance_days: this.toDecimal(previousBalanceDays),
      amount_days: this.toDecimal(input.amountDays),
      new_balance_days: this.toDecimal(nextBalanceDays),
      previous_pending_days: this.toDecimal(previousPendingDays),
      pending_delta_days: this.toDecimal(normalizedPendingDelta),
      new_pending_days: this.toDecimal(normalizedPendingDays),
      previous_used_days: this.toDecimal(previousUsedDays),
      used_delta_days: this.toDecimal(normalizedUsedDelta),
      new_used_days: this.toDecimal(normalizedUsedDays),
      reason: input.reason?.trim() || null,
      idempotency_key: input.idempotencyKey,
      metadata: input.metadata ?? null,
      created_by_company_user_id: input.createdByCompanyUserId ?? null,
      reversed_transaction_id: input.reversedTransactionId ?? null,
      is_reversal: input.isReversal ?? false,
    });

    let savedTransaction: LeaveBalanceTransaction;
    try {
      savedTransaction = await transactionRepository.save(transaction);
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const duplicate = await transactionRepository.findOneOrFail({
        where: {
          company_id: input.companyId,
          idempotency_key: input.idempotencyKey,
        },
      });

      const currentBalance =
        (input.balance.id
          ? await balanceRepository.findOne({ where: { id: input.balance.id } })
          : null) ?? input.balance;

      return {
        balance: currentBalance,
        transaction: duplicate,
        created: false,
      };
    }

    input.balance.pending_days = this.toDecimal(normalizedPendingDays);
    input.balance.used_days = this.toDecimal(normalizedUsedDays);
    input.balance.last_transaction_id = savedTransaction.id;
    this.applyBalanceMetadata(input.balance, input.companyId, input.leaveYear);

    const savedBalance = await balanceRepository.save(input.balance);

    return {
      balance: savedBalance,
      transaction: savedTransaction,
      created: true,
    };
  }

  async reserveLeave(
    balance: LeaveBalance,
    params: {
      companyId: number;
      employeeId: number;
      leaveTypeId: number;
      leaveYear: string;
      effectiveDate: string;
      days: number;
      allowNegativeBalance: boolean;
      leaveRequestId?: number | null;
      createdByCompanyUserId?: number | null;
      reason?: string | null;
      metadata?: Record<string, unknown> | null;
      idempotencyKey: string;
    },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult> {
    if (params.days <= 0) {
      throw new BadRequestException('Leave days must be greater than zero');
    }

    if (balance.closed_at) {
      throw new BadRequestException(
        `Leave year ${balance.fiscal_year} has been closed by the year-end rollover. Ask HR to record an adjustment instead.`,
      );
    }
    const available = this.calculateYearCeilingDays(balance);
    if (!params.allowNegativeBalance && available < params.days) {
      throw new BadRequestException(
        `Insufficient leave balance. Available: ${available.toFixed(2)} day(s)`,
      );
    }

    return this.createTransaction(
      {
        balance,
        companyId: params.companyId,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        leaveYear: params.leaveYear,
        effectiveDate: params.effectiveDate,
        transactionType: LeaveBalanceTransactionTypeEnum.RESERVED,
        idempotencyKey: params.idempotencyKey,
        amountDays: -params.days,
        pendingDeltaDays: params.days,
        leaveRequestId: params.leaveRequestId ?? null,
        createdByCompanyUserId: params.createdByCompanyUserId ?? null,
        reason: params.reason ?? 'Leave days reserved',
        metadata: params.metadata ?? null,
      },
      manager,
    );
  }

  async reserveLeaveByYear(
    balances: LeaveBalance[],
    params: Omit<
      Parameters<LeaveBalanceLedgerService['reserveLeave']>[1],
      'leaveYear'
    > & { leaveYear: string },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult[]> {
    const results: LedgerMutationResult[] = [];
    for (const balance of balances) {
      const year = balance.fiscal_year;
      const days = this.daysForBalanceYear(
        balance,
        params.days,
        params.leaveYear,
        params.metadata,
      );
      if (days <= 0) continue;
      results.push(
        await this.reserveLeave(
          balance,
          {
            ...params,
            leaveYear: year,
            days,
            idempotencyKey: `${params.idempotencyKey}:year:${year}`,
            metadata: { ...params.metadata, allocated_days: days },
          },
          manager,
        ),
      );
    }
    return results;
  }

  async releaseReservedLeave(
    balance: LeaveBalance,
    params: {
      companyId: number;
      employeeId: number;
      leaveTypeId: number;
      leaveYear: string;
      effectiveDate: string;
      days: number;
      leaveRequestId?: number | null;
      createdByCompanyUserId?: number | null;
      reason?: string | null;
      metadata?: Record<string, unknown> | null;
      idempotencyKey: string;
    },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult> {
    const previousPendingDays = this.toNumber(balance.pending_days);
    const releasableDays = Math.min(
      previousPendingDays,
      Math.max(0, params.days),
    );

    return this.createTransaction(
      {
        balance,
        companyId: params.companyId,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        leaveYear: params.leaveYear,
        effectiveDate: params.effectiveDate,
        transactionType: LeaveBalanceTransactionTypeEnum.RESERVATION_RELEASED,
        idempotencyKey: params.idempotencyKey,
        amountDays: releasableDays,
        pendingDeltaDays: -releasableDays,
        leaveRequestId: params.leaveRequestId ?? null,
        createdByCompanyUserId: params.createdByCompanyUserId ?? null,
        reason: params.reason ?? 'Reserved leave released',
        metadata: params.metadata ?? null,
      },
      manager,
    );
  }

  async releaseReservedLeaveByYear(
    balances: LeaveBalance[],
    params: Omit<
      Parameters<LeaveBalanceLedgerService['releaseReservedLeave']>[1],
      'leaveYear'
    > & { leaveYear: string },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult[]> {
    const results: LedgerMutationResult[] = [];
    for (const balance of balances) {
      const days = this.daysForBalanceYear(
        balance,
        params.days,
        params.leaveYear,
        params.metadata,
      );
      if (days <= 0) continue;
      results.push(
        await this.releaseReservedLeave(
          balance,
          {
            ...params,
            leaveYear: balance.fiscal_year,
            days,
            idempotencyKey: `${params.idempotencyKey}:year:${balance.fiscal_year}`,
          },
          manager,
        ),
      );
    }
    return results;
  }

  async consumeReservedLeave(
    balance: LeaveBalance,
    params: {
      companyId: number;
      employeeId: number;
      leaveTypeId: number;
      leaveYear: string;
      effectiveDate: string;
      days: number;
      leaveRequestId?: number | null;
      createdByCompanyUserId?: number | null;
      reason?: string | null;
      metadata?: Record<string, unknown> | null;
      idempotencyKey: string;
    },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult> {
    const previousPendingDays = this.toNumber(balance.pending_days);
    const consumedPendingDays = Math.min(
      previousPendingDays,
      Math.max(0, params.days),
    );

    return this.createTransaction(
      {
        balance,
        companyId: params.companyId,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        leaveYear: params.leaveYear,
        effectiveDate: params.effectiveDate,
        transactionType: LeaveBalanceTransactionTypeEnum.TAKEN,
        idempotencyKey: params.idempotencyKey,
        amountDays: 0,
        pendingDeltaDays: -consumedPendingDays,
        usedDeltaDays: Math.max(0, params.days),
        leaveRequestId: params.leaveRequestId ?? null,
        createdByCompanyUserId: params.createdByCompanyUserId ?? null,
        reason: params.reason ?? 'Reserved leave consumed',
        metadata: params.metadata ?? null,
      },
      manager,
    );
  }

  async consumeReservedLeaveByYear(
    balances: LeaveBalance[],
    params: Omit<
      Parameters<LeaveBalanceLedgerService['consumeReservedLeave']>[1],
      'leaveYear'
    > & { leaveYear: string },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult[]> {
    const results: LedgerMutationResult[] = [];
    for (const balance of balances) {
      const year = balance.fiscal_year;
      const days = this.daysForBalanceYear(
        balance,
        params.days,
        params.leaveYear,
        params.metadata,
      );
      if (days <= 0) continue;
      results.push(
        await this.consumeReservedLeave(
          balance,
          {
            ...params,
            leaveYear: year,
            days,
            idempotencyKey: `${params.idempotencyKey}:year:${year}`,
            metadata: { ...params.metadata, allocated_days: days },
          },
          manager,
        ),
      );
    }
    return results;
  }

  async reverseApprovedLeave(
    balance: LeaveBalance,
    params: {
      companyId: number;
      employeeId: number;
      leaveTypeId: number;
      leaveYear: string;
      effectiveDate: string;
      days: number;
      leaveRequestId?: number | null;
      createdByCompanyUserId?: number | null;
      reason?: string | null;
      metadata?: Record<string, unknown> | null;
      idempotencyKey: string;
    },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult> {
    if (balance.closed_at) {
      // Closed years are frozen after rollover; refunds must go through
      // reverseApprovedLeaveByYear's onClosedYear handler instead.
      throw new BadRequestException(
        `Leave year ${balance.fiscal_year} has been closed by the year-end rollover; its balance cannot be changed.`,
      );
    }
    const previousUsedDays = this.toNumber(balance.used_days);
    const reversibleDays = Math.min(previousUsedDays, Math.max(0, params.days));

    return this.createTransaction(
      {
        balance,
        companyId: params.companyId,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        leaveYear: params.leaveYear,
        effectiveDate: params.effectiveDate,
        transactionType: LeaveBalanceTransactionTypeEnum.CANCELLED_REVERSAL,
        idempotencyKey: params.idempotencyKey,
        amountDays: reversibleDays,
        usedDeltaDays: -reversibleDays,
        leaveRequestId: params.leaveRequestId ?? null,
        createdByCompanyUserId: params.createdByCompanyUserId ?? null,
        reason: params.reason ?? 'Approved leave reversed',
        metadata: params.metadata ?? null,
        isReversal: true,
      },
      manager,
    );
  }

  async reverseApprovedLeaveByYear(
    balances: LeaveBalance[],
    params: Omit<
      Parameters<LeaveBalanceLedgerService['reverseApprovedLeave']>[1],
      'leaveYear'
    > & {
      leaveYear: string;
      /**
       * Days that belong to a year already closed by rollover. The closed
       * year stays frozen; the handler posts the correction elsewhere
       * (e.g. a credit to the current year). Without it, such a refund fails.
       */
      onClosedYear?: (
        closedBalance: LeaveBalance,
        days: number,
        idempotencyKey: string,
      ) => Promise<LedgerMutationResult | null>;
    },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult[]> {
    const results: LedgerMutationResult[] = [];
    const { onClosedYear, ...reverseParams } = params;
    for (const balance of balances) {
      const days = this.daysForBalanceYear(
        balance,
        params.days,
        params.leaveYear,
        params.metadata,
      );
      if (days <= 0) continue;
      if (balance.closed_at) {
        const key = `${params.idempotencyKey}:year:${balance.fiscal_year}:closed`;
        if (!onClosedYear) {
          throw new BadRequestException(
            `Leave year ${balance.fiscal_year} has been closed by the year-end rollover; its days cannot be refunded there.`,
          );
        }
        const redirected = await onClosedYear(balance, days, key);
        if (redirected) results.push(redirected);
        continue;
      }
      results.push(
        await this.reverseApprovedLeave(
          balance,
          {
            ...reverseParams,
            leaveYear: balance.fiscal_year,
            days,
            idempotencyKey: `${params.idempotencyKey}:year:${balance.fiscal_year}`,
            metadata: { ...params.metadata, allocated_days: days },
          },
          manager,
        ),
      );
    }
    return results;
  }

  /**
   * Records a carry-forward or expiry movement in the balance history.
   * The balance row itself is updated by the caller; this keeps the audit
   * trail. Idempotent per key.
   */
  async recordBalanceMovement(
    input: {
      balance: LeaveBalance;
      companyId: number;
      transactionType:
        | LeaveBalanceTransactionTypeEnum.CARRY_FORWARD
        | LeaveBalanceTransactionTypeEnum.EXPIRED
        | LeaveBalanceTransactionTypeEnum.LAPSED;
      amountDays: number;
      effectiveDate: string;
      reason: string;
      idempotencyKey: string;
      metadata?: Record<string, unknown>;
    },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult> {
    return this.createTransaction(
      {
        balance: input.balance,
        companyId: input.companyId,
        employeeId: input.balance.employee_id,
        leaveTypeId: input.balance.leave_type_id,
        leaveYear: input.balance.fiscal_year,
        effectiveDate: input.effectiveDate,
        transactionType: input.transactionType,
        amountDays: input.amountDays,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      },
      manager,
    );
  }

  /** Net year-end lapse already recorded (as a positive number of days). */
  async sumLapsedRecorded(
    balance: LeaveBalance,
    manager?: EntityManager,
  ): Promise<number> {
    const row = await this.getTransactionRepository(manager)
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.amount_days), 0)', 'total')
      .where('tx.leave_balance_id = :balanceId', { balanceId: balance.id })
      .andWhere('tx.transaction_type = :type', {
        type: LeaveBalanceTransactionTypeEnum.LAPSED,
      })
      .getRawOne<{ total: string }>();
    return -this.toNumber(row?.total);
  }

  /** Net carry-forward already recorded in the history for a balance. */
  async sumCarryForwardRecorded(
    balance: LeaveBalance,
    manager?: EntityManager,
  ): Promise<number> {
    const row = await this.getTransactionRepository(manager)
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.amount_days), 0)', 'total')
      .where('tx.leave_balance_id = :balanceId', { balanceId: balance.id })
      .andWhere('tx.transaction_type = :type', {
        type: LeaveBalanceTransactionTypeEnum.CARRY_FORWARD,
      })
      .getRawOne<{ total: string }>();
    return this.toNumber(row?.total);
  }

  async applyManualAdjustment(
    balance: LeaveBalance,
    params: {
      companyId: number;
      employeeId: number;
      leaveTypeId: number;
      leaveYear: string;
      effectiveDate: string;
      mode: LeaveBalanceAdjustmentModeEnum;
      amount: number;
      reason: string;
      createdByCompanyUserId?: number | null;
      idempotencyKey: string;
      source?: LeaveBalanceAdjustmentSourceEnum;
      importBatchId?: number | null;
      importRowId?: number | null;
      reference?: string | null;
      metadata?: Record<string, unknown> | null;
      /**
       * Maximum accumulation for this balance. Credits that would take the
       * available balance above it are refused unless `override` is given
       * (callers check leave_balances:override_cap before passing it).
       */
      accumulationCap?: AccumulationCapInput;
    },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult> {
    if (params.amount < 0) {
      throw new BadRequestException('Adjustment amount cannot be negative');
    }
    // Lock the row so concurrent credits cannot both pass the cap check.
    if (manager && balance.id && params.accumulationCap) {
      const locked = await manager.getRepository(LeaveBalance).findOne({
        where: { id: balance.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (locked) Object.assign(balance, locked);
    }

    // Adjustments are expressed against the balance employees and HR see,
    // so SET lands exactly on the requested figure for every accrual method.
    const previousAvailableDays = calculateAvailableLeaveDays(balance);
    let delta = params.amount;
    if (params.mode === LeaveBalanceAdjustmentModeEnum.DEDUCT) {
      delta = -params.amount;
    } else if (params.mode === LeaveBalanceAdjustmentModeEnum.SET) {
      delta = params.amount - previousAvailableDays;
    }
    const source = params.source ?? LeaveBalanceAdjustmentSourceEnum.MANUAL;
    const capMetadata = assertWithinAccumulationCap(
      previousAvailableDays,
      delta,
      params.accumulationCap,
    );

    const result = await this.createTransaction(
      {
        balance,
        companyId: params.companyId,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        leaveYear: params.leaveYear,
        effectiveDate: params.effectiveDate,
        transactionType: LeaveBalanceTransactionTypeEnum.ADJUSTMENT,
        idempotencyKey: params.idempotencyKey,
        amountDays: delta,
        previousBalanceDays: previousAvailableDays,
        createdByCompanyUserId: params.createdByCompanyUserId ?? null,
        reason: params.reason,
        metadata: {
          ...(params.metadata ?? {}),
          adjustment_mode: params.mode,
          adjustment_source: source,
          adjustment_direction: delta >= 0 ? 'INCREASE' : 'DECREASE',
          ...(params.importBatchId
            ? { import_batch_id: params.importBatchId }
            : {}),
          ...(params.reference ? { reference: params.reference } : {}),
          ...(capMetadata ? { accumulation_cap: capMetadata } : {}),
        },
      },
      manager,
    );

    if (!result.created) {
      return result;
    }

    balance.adjusted_days = this.toDecimal(
      this.toNumber(balance.adjusted_days) + delta,
    );
    result.balance.adjusted_days = balance.adjusted_days;
    result.balance = await this.getBalanceRepository(manager).save(
      result.balance,
    );

    const nextAvailableDays = calculateAvailableLeaveDays(result.balance);
    const adjustment = await this.getAdjustmentRepository(manager).save(
      this.getAdjustmentRepository(manager).create({
        company_id: params.companyId,
        leave_balance_id: result.balance.id,
        employee_id: params.employeeId,
        leave_type_id: params.leaveTypeId,
        fiscal_year: params.leaveYear,
        old_balance_days: this.toDecimal(previousAvailableDays),
        new_balance_days: this.toDecimal(nextAvailableDays),
        adjustment_amount_days: this.toDecimal(delta),
        reason: params.reason.trim(),
        source,
        adjusted_by_company_user_id: params.createdByCompanyUserId ?? null,
        leave_balance_transaction_id: result.transaction.id,
        import_batch_id: params.importBatchId ?? null,
        import_row_id: params.importRowId ?? null,
        reference: params.reference ?? null,
      }),
    );

    return {
      ...result,
      adjustment,
    };
  }

  async applyEncashment(
    balance: LeaveBalance,
    params: {
      companyId: number;
      employeeId: number;
      leaveTypeId: number;
      leaveYear: string;
      effectiveDate: string;
      days: number;
      requestId: number;
      createdByCompanyUserId?: number | null;
      reason?: string | null;
      idempotencyKey: string;
    },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult> {
    if (!Number.isFinite(params.days) || params.days <= 0) {
      throw new BadRequestException(
        'Encashment days must be greater than zero.',
      );
    }

    const previousAvailableDays = calculateAvailableLeaveDays(balance);
    const result = await this.createTransaction(
      {
        balance,
        companyId: params.companyId,
        employeeId: params.employeeId,
        leaveTypeId: params.leaveTypeId,
        leaveYear: params.leaveYear,
        effectiveDate: params.effectiveDate,
        transactionType: LeaveBalanceTransactionTypeEnum.ENCASHMENT,
        idempotencyKey: params.idempotencyKey,
        amountDays: -params.days,
        previousBalanceDays: previousAvailableDays,
        createdByCompanyUserId: params.createdByCompanyUserId ?? null,
        reason: params.reason ?? 'Leave balance encashment approved',
        metadata: {
          encashment_request_id: params.requestId,
          encashed_days: params.days,
          payroll_handoff_required: true,
        },
      },
      manager,
    );

    if (!result.created) {
      return result;
    }

    result.balance.adjusted_days = this.toDecimal(
      this.toNumber(result.balance.adjusted_days) - params.days,
    );
    result.balance.last_transaction_id = result.transaction.id;
    result.balance = await this.getBalanceRepository(manager).save(
      result.balance,
    );
    return result;
  }

  /** Gives encashed days back when an unpaid encashment is reversed. */
  async reverseEncashment(
    balance: LeaveBalance,
    params: {
      companyId: number;
      days: number;
      requestId: number;
      createdByCompanyUserId?: number | null;
      reason: string;
      idempotencyKey: string;
    },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult> {
    if (!Number.isFinite(params.days) || params.days <= 0) {
      throw new BadRequestException('Reversed days must be greater than zero.');
    }
    const result = await this.createTransaction(
      {
        balance,
        companyId: params.companyId,
        employeeId: balance.employee_id,
        leaveTypeId: balance.leave_type_id,
        leaveYear: balance.fiscal_year,
        effectiveDate: new Date().toISOString().slice(0, 10),
        transactionType: LeaveBalanceTransactionTypeEnum.CANCELLED_REVERSAL,
        idempotencyKey: params.idempotencyKey,
        amountDays: params.days,
        previousBalanceDays: calculateAvailableLeaveDays(balance),
        createdByCompanyUserId: params.createdByCompanyUserId ?? null,
        reason: params.reason,
        isReversal: true,
        metadata: {
          encashment_request_id: params.requestId,
          reversed_days: params.days,
        },
      },
      manager,
    );
    if (!result.created) return result;
    result.balance.adjusted_days = this.toDecimal(
      this.toNumber(result.balance.adjusted_days) + params.days,
    );
    result.balance.last_transaction_id = result.transaction.id;
    result.balance = await this.getBalanceRepository(manager).save(
      result.balance,
    );
    return result;
  }

  async findTransactions(
    companyId: number,
    filters: {
      employeeIds: number[] | null;
      employeeId?: number;
      leaveTypeId?: number;
      leaveRequestId?: number;
      fiscalYear?: string;
      transactionType?: LeaveBalanceTransactionTypeEnum;
      page?: number;
      limit?: number;
    },
  ) {
    const {
      employeeIds,
      employeeId,
      leaveTypeId,
      leaveRequestId,
      fiscalYear,
      transactionType,
      page = 1,
      limit = 20,
    } = filters;

    const qb = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.employee', 'employee')
      .leftJoinAndSelect('transaction.leave_type', 'leaveType')
      .leftJoinAndSelect('transaction.leave_request', 'leaveRequest')
      .leftJoinAndSelect(
        'transaction.created_by_company_user',
        'createdByMembership',
      )
      .leftJoinAndSelect('createdByMembership.user', 'createdByUser')
      .where('transaction.company_id = :companyId', { companyId });

    if (employeeIds && !employeeIds.length) {
      qb.andWhere('1 = 0');
    } else if (employeeIds) {
      qb.andWhere('transaction.employee_id IN (:...employeeIds)', {
        employeeIds,
      });
    }
    if (typeof employeeId === 'number') {
      qb.andWhere('transaction.employee_id = :employeeId', { employeeId });
    }
    if (typeof leaveTypeId === 'number') {
      qb.andWhere('transaction.leave_type_id = :leaveTypeId', {
        leaveTypeId,
      });
    }
    if (typeof leaveRequestId === 'number') {
      qb.andWhere('transaction.leave_request_id = :leaveRequestId', {
        leaveRequestId,
      });
    }
    if (fiscalYear?.trim()) {
      qb.andWhere('transaction.leave_year = :fiscalYear', {
        fiscalYear: fiscalYear.trim(),
      });
    }
    if (transactionType) {
      qb.andWhere('transaction.transaction_type = :transactionType', {
        transactionType,
      });
    }

    return qb
      .orderBy('transaction.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }
}

export interface AccumulationCapInput {
  maximumDays: number | null;
  policyReference?: string | null;
  override?: { reason: string } | null;
}

/**
 * Central maximum-accumulation rule for balance credits. Returns what to
 * record on the ledger row (null when no cap applies) and throws when a
 * credit would exceed the cap without an override. Debits are never limited.
 */
export function assertWithinAccumulationCap(
  availableBefore: number,
  delta: number,
  cap: AccumulationCapInput | undefined,
): Record<string, unknown> | null {
  if (!cap || cap.maximumDays === null || delta <= 0) return null;
  const max = cap.maximumDays;
  const after = availableBefore + delta;
  const capacity = Math.max(0, max - availableBefore);
  const base = {
    maximum_days: max,
    requested_credit_days: Number(delta.toFixed(2)),
    capacity_days: Number(capacity.toFixed(2)),
    policy_reference: cap.policyReference ?? null,
  };
  if (after <= max + 1e-9) return { ...base, exceeded: false };
  const reason = cap.override?.reason?.trim() ?? '';
  if (!cap.override || reason.length < 5) {
    throw new BadRequestException(
      `This credit of ${delta.toFixed(2)} day(s) would take the balance to ${after.toFixed(2)}, above the policy's maximum accumulation of ${max.toFixed(2)} day(s). At most ${capacity.toFixed(2)} day(s) can be credited.` +
        (cap.override
          ? ' Give a cap override reason of at least 5 characters.'
          : ''),
    );
  }
  return {
    ...base,
    exceeded: true,
    excess_days: Number((after - max).toFixed(2)),
    override_reason: reason,
  };
}
