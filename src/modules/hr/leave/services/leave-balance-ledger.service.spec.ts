import { Repository } from 'typeorm';
import { LeaveBalanceAdjustment } from '../entities/leave-balance-adjustment.entity';
import { LeaveBalanceTransaction } from '../entities/leave-balance-transaction.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveBalanceAdjustmentModeEnum } from '../enums/leave-balance-adjustment-mode.enum';
import { LeaveBalanceAdjustmentSourceEnum } from '../enums/leave-balance-adjustment-source.enum';
import { calculateAvailableLeaveDays } from '../utils/leave-balance-rules.util';
import { LeaveBalanceLedgerService } from './leave-balance-ledger.service';

const createRepositoryMock = () => ({
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn((value: Record<string, unknown>) =>
    Promise.resolve({ id: 99, ...value }),
  ),
  create: jest.fn((value: Record<string, unknown>) => value),
});

describe('LeaveBalanceLedgerService.applyManualAdjustment', () => {
  // Monthly accrual: 21 days entitlement, 14 accrued so far. Leave
  // Management shows 14 available.
  const monthlyBalance = (): LeaveBalance =>
    ({
      id: 5,
      company_id: 10,
      employee_id: 101,
      leave_type_id: 1,
      fiscal_year: '2026',
      allocated_days: '21.00',
      opening_balance_days: '0.00',
      entitlement_days: '21.00',
      accrued_days: '14.00',
      used_days: '0.00',
      pending_days: '0.00',
      approved_future_days: '0.00',
      carried_forward_days: '0.00',
      expired_days: '0.00',
      adjusted_days: '0.00',
      attendance_deduction_days: '0.00',
      version: 1,
    }) as LeaveBalance;

  let transactions: ReturnType<typeof createRepositoryMock>;
  let adjustments: ReturnType<typeof createRepositoryMock>;
  let service: LeaveBalanceLedgerService;

  beforeEach(() => {
    transactions = createRepositoryMock();
    adjustments = createRepositoryMock();
    const balances = {
      ...createRepositoryMock(),
      save: jest.fn((value: LeaveBalance) => Promise.resolve(value)),
    };
    service = new LeaveBalanceLedgerService(
      transactions as unknown as Repository<LeaveBalanceTransaction>,
      balances as unknown as Repository<LeaveBalance>,
      adjustments as unknown as Repository<LeaveBalanceAdjustment>,
    );
  });

  it('sets the balance shown in Leave Management to exactly the requested figure', async () => {
    const balance = monthlyBalance();
    expect(calculateAvailableLeaveDays(balance)).toBe(14);

    const result = await service.applyManualAdjustment(balance, {
      companyId: 10,
      employeeId: 101,
      leaveTypeId: 1,
      leaveYear: '2026',
      effectiveDate: '2026-09-26',
      mode: LeaveBalanceAdjustmentModeEnum.SET,
      amount: 10,
      reason: 'Correction',
      idempotencyKey: 'test-set',
    });

    expect(calculateAvailableLeaveDays(result.balance)).toBe(10);
    expect(transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        previous_balance_days: '14.00',
        amount_days: '-4.00',
        new_balance_days: '10.00',
      }),
    );
    expect(adjustments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        old_balance_days: '14.00',
        new_balance_days: '10.00',
        adjustment_amount_days: '-4.00',
        source: LeaveBalanceAdjustmentSourceEnum.MANUAL,
        import_batch_id: null,
      }),
    );
  });

  it('records bulk import provenance on the adjustment and ledger entry', async () => {
    await service.applyManualAdjustment(monthlyBalance(), {
      companyId: 10,
      employeeId: 101,
      leaveTypeId: 1,
      leaveYear: '2026',
      effectiveDate: '2026-09-26',
      mode: LeaveBalanceAdjustmentModeEnum.ADD,
      amount: 2,
      reason: 'Bulk correction',
      idempotencyKey: 'leave-balance-import:7:row:3',
      source: LeaveBalanceAdjustmentSourceEnum.BULK_IMPORT,
      importBatchId: 7,
      importRowId: 3,
      reference: 'LBI-20260926-ABC123#4',
    });

    expect(transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          adjustment_source: LeaveBalanceAdjustmentSourceEnum.BULK_IMPORT,
          adjustment_direction: 'INCREASE',
          import_batch_id: 7,
          reference: 'LBI-20260926-ABC123#4',
        }),
      }),
    );
    expect(adjustments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: LeaveBalanceAdjustmentSourceEnum.BULK_IMPORT,
        import_batch_id: 7,
        import_row_id: 3,
        leave_balance_transaction_id: 99,
        reference: 'LBI-20260926-ABC123#4',
      }),
    );
  });
});
