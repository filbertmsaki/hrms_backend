import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveBalanceTransactionTypeEnum } from '../enums/leave-balance-transaction-type.enum';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveCarryForwardService } from './leave-carry-forward.service';

function balanceService(remaining: number) {
  const service = Object.create(
    LeaveBalanceService.prototype,
  ) as LeaveBalanceService & { yearEndRemainingDays: jest.Mock };
  service.yearEndRemainingDays = jest.fn().mockReturnValue(remaining);
  return service;
}

const type = (allowed: boolean, max: number | null) =>
  ({
    is_carry_forward_allowed: allowed,
    max_carry_forward_days: max === null ? null : String(max),
  }) as unknown as LeaveType;
const previous = { id: 5, fiscal_year: '2025' } as LeaveBalance;
const employee = {} as never;

describe('LeaveBalanceService.yearEndSplit', () => {
  it('lapses everything when carry forward is off', () => {
    expect(
      balanceService(8).yearEndSplit(
        previous,
        type(false, null),
        null,
        employee,
      ),
    ).toEqual({ remaining: 8, carried: 0, lapsed: 8 });
  });

  it('lapses only the days above the cap', () => {
    expect(
      balanceService(8).yearEndSplit(previous, type(true, 5), null, employee),
    ).toEqual({ remaining: 8, carried: 5, lapsed: 3 });
  });

  it('lapses nothing without a cap or when nothing is left', () => {
    expect(
      balanceService(8).yearEndSplit(
        previous,
        type(true, null),
        null,
        employee,
      ),
    ).toEqual({ remaining: 8, carried: 8, lapsed: 0 });
    expect(
      balanceService(-2).yearEndSplit(previous, type(true, 5), null, employee),
    ).toEqual({ remaining: 0, carried: 0, lapsed: 0 });
  });
});

describe('LeaveBalanceService maximum accumulation', () => {
  const assignment = (
    quota: number,
    typeMax: string | null,
    policyMax: string | null = null,
  ) =>
    ({
      annualQuotaDays: quota,
      policyType: { maximum_accumulation_days: typeMax },
      policy: { maximum_accumulation_days: policyMax },
    }) as never;

  it('limits carried days so carried + entitlement stays within the cap', () => {
    // 30-day cap, 21-day quota: at most 9 days can come across.
    expect(
      balanceService(15).yearEndSplit(
        previous,
        type(true, null),
        assignment(21, '30'),
        employee,
      ),
    ).toEqual({ remaining: 15, carried: 9, lapsed: 6 });
  });

  it('applies the stricter of the carry-forward cap and the accumulation cap', () => {
    expect(
      balanceService(15).yearEndSplit(
        previous,
        type(true, 5),
        assignment(21, '30'),
        employee,
      ),
    ).toEqual({ remaining: 15, carried: 5, lapsed: 10 });
  });

  it('carries nothing when the quota alone reaches the cap', () => {
    expect(
      balanceService(4).yearEndSplit(
        previous,
        type(true, null),
        assignment(21, '20'),
        employee,
      ),
    ).toEqual({ remaining: 4, carried: 0, lapsed: 4 });
  });

  it('falls back to the policy value and ignores unset or zero caps', () => {
    const service = balanceService(0);
    expect(service.maximumAccumulationDays(assignment(21, null, '40'))).toBe(
      40,
    );
    expect(service.maximumAccumulationDays(assignment(21, '0'))).toBeNull();
    expect(service.maximumAccumulationDays(assignment(21, null))).toBeNull();
    expect(service.maximumAccumulationDays(null)).toBeNull();
  });
});

describe('LeaveCarryForwardService.recordYearEndLapse', () => {
  function setup(lapsed: number, alreadyRecorded: number) {
    const current = {
      id: 9,
      employee_id: 1,
      leave_type_id: 2,
      fiscal_year: '2026',
    } as LeaveBalance;
    const manager = {
      getRepository: () => ({
        findOne: jest
          .fn()
          .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve(
              where.id === 9
                ? current
                : where.fiscal_year === '2025'
                  ? previous
                  : { id: where.id ?? 1 },
            ),
          ),
      }),
    };
    const ledger = {
      sumLapsedRecorded: jest.fn().mockResolvedValue(alreadyRecorded),
      recordBalanceMovement: jest.fn().mockResolvedValue(undefined),
    };
    const leaveBalanceService = {
      resolvePolicyAssignment: jest.fn().mockResolvedValue(null),
      yearEndSplit: jest
        .fn()
        .mockReturnValue({ remaining: 8, carried: 8 - lapsed, lapsed }),
    };
    const service = new LeaveCarryForwardService(
      {} as never,
      leaveBalanceService as never,
      ledger as never,
    );
    return { service, ledger, manager };
  }

  it('records the lapse on last year’s balance', async () => {
    const { service, ledger, manager } = setup(3, 0);
    await expect(
      service.recordYearEndLapse(10, 9, manager as never),
    ).resolves.toBe(true);
    expect(ledger.recordBalanceMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: previous,
        transactionType: LeaveBalanceTransactionTypeEnum.LAPSED,
        amountDays: -3,
        effectiveDate: '2025-12-31',
      }),
      manager,
    );
  });

  it('writes only the correction after a late change to last year', async () => {
    const { service, ledger, manager } = setup(2, 3);
    await service.recordYearEndLapse(10, 9, manager as never);
    expect(ledger.recordBalanceMovement).toHaveBeenCalledWith(
      expect.objectContaining({ amountDays: 1 }),
      manager,
    );
  });

  it('does nothing when already up to date', async () => {
    const { service, ledger, manager } = setup(3, 3);
    await expect(
      service.recordYearEndLapse(10, 9, manager as never),
    ).resolves.toBe(false);
    expect(ledger.recordBalanceMovement).not.toHaveBeenCalled();
  });
});
