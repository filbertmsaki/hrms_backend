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

    const available = this.calculateAvailableDays(balance);
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
    },
    manager?: EntityManager,
  ): Promise<LedgerMutationResult> {
    if (params.amount < 0) {
      throw new BadRequestException('Adjustment amount cannot be negative');
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

    if (employeeIds && employeeIds.length) {
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
