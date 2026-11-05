import { DataSource, EntityManager } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveBalanceTransactionTypeEnum } from '../enums/leave-balance-transaction-type.enum';
import { LeaveBalanceLedgerService } from './leave-balance-ledger.service';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveCarryForwardService } from './leave-carry-forward.service';

type Setup = {
  carried: string;
  consumeFirst: boolean;
  takenBeforeExpiry: number;
  recordedCarryForward?: number;
};

function setup(options: Setup) {
  const balance = {
    id: 9,
    company_id: 10,
    employee_id: 501,
    leave_type_id: 7,
    fiscal_year: '2026',
    entitlement_days: '28.00',
    opening_balance_days: options.carried,
    carried_forward_days: options.carried,
    expired_days: '0.00',
  } as LeaveBalance;
  const saveBalance = jest.fn((value: unknown) => Promise.resolve(value));
  const approved = options.takenBeforeExpiry
    ? [
        {
          total_days: String(options.takenBeforeExpiry),
          calculation_snapshot: null,
        },
      ]
    : [];
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === LeaveBalance)
        return {
          findOne: jest.fn().mockResolvedValue(balance),
          save: saveBalance,
        };
      if (entity === Employee)
        return {
          findOne: jest
            .fn()
            .mockResolvedValue({ id: 501, hire_date: '2020-01-01' }),
        };
      if (entity === LeaveType)
        return {
          findOne: jest.fn().mockResolvedValue({
            is_carry_forward_allowed: true,
            max_carry_forward_days: null,
          }),
        };
      if (entity === LeaveRequest)
        return {
          createQueryBuilder: () => ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue(approved),
          }),
        };
      throw new Error('Unexpected repository');
    },
  } as unknown as EntityManager;

  const balanceService = Object.create(
    LeaveBalanceService.prototype,
  ) as LeaveBalanceService;
  jest.spyOn(balanceService, 'resolvePolicyAssignment').mockResolvedValue({
    policy: { accrual_method: 'daily', accrual_rate: null },
    policyType: {
      carry_forward_enabled: true,
      carry_forward_max_days: null,
      carry_forward_expiry_months: 3,
      carry_forward_expiry_date: null,
      carry_forward_auto_expire: true,
      carry_forward_consume_first: options.consumeFirst,
      accrual_method: null,
    },
    annualQuotaDays: 28,
  } as never);

  const ledger = {
    sumCarryForwardRecorded: jest
      .fn()
      .mockResolvedValue(
        options.recordedCarryForward ?? Number(options.carried),
      ),
    recordBalanceMovement: jest.fn().mockResolvedValue({}),
  };
  const service = new LeaveCarryForwardService(
    {} as DataSource,
    balanceService,
    ledger as unknown as LeaveBalanceLedgerService,
  );
  const run = (today: string) =>
    (
      service as unknown as {
        processBalance: (...args: unknown[]) => Promise<{
          recorded: boolean;
          expired: boolean;
        }>;
      }
    ).processBalance(10, 9, today, manager);
  return { run, balance, ledger };
}

describe('carry-forward expiry', () => {
  it('does nothing before the expiry date (31 March for 3 months)', async () => {
    const { run, ledger } = setup({
      carried: '5.00',
      consumeFirst: true,
      takenBeforeExpiry: 0,
    });
    expect(await run('2026-03-31')).toEqual({
      recorded: false,
      expired: false,
    });
    expect(ledger.recordBalanceMovement).not.toHaveBeenCalled();
  });

  it('expires unused carried days, consuming carried leave first', async () => {
    const { run, balance, ledger } = setup({
      carried: '5.00',
      consumeFirst: true,
      takenBeforeExpiry: 3,
    });
    expect((await run('2026-04-01')).expired).toBe(true);
    expect(balance.expired_days).toBe('2.00');
    expect(ledger.recordBalanceMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: LeaveBalanceTransactionTypeEnum.EXPIRED,
        amountDays: -2,
        effectiveDate: '2026-03-31',
      }),
      expect.anything(),
    );
  });

  it('uses accrued days first when configured, so more carried days expire', async () => {
    // By 31 March about 6.9 days have accrued, covering the 3 days taken.
    const { run, balance } = setup({
      carried: '5.00',
      consumeFirst: false,
      takenBeforeExpiry: 3,
    });
    await run('2026-04-01');
    expect(balance.expired_days).toBe('5.00');
  });

  it('records a carry-forward change in the balance history', async () => {
    const { run, ledger } = setup({
      carried: '5.00',
      consumeFirst: true,
      takenBeforeExpiry: 0,
      recordedCarryForward: 0,
    });
    expect((await run('2026-01-02')).recorded).toBe(true);
    expect(ledger.recordBalanceMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: LeaveBalanceTransactionTypeEnum.CARRY_FORWARD,
        amountDays: 5,
      }),
      expect.anything(),
    );
  });
});
