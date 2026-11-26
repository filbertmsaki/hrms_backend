import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveBalanceLedgerService } from '../services/leave-balance-ledger.service';
import {
  calculateAvailableLeaveDays,
  isLeaveBalanceVisibleForEmployee,
} from './leave-balance-rules.util';
import { LeaveGenderRestrictionEnum } from '../enums/leave-gender-restriction.enum';

// Monthly accrual, mid-year: 21-day year, 7 accrued so far, 3 carried, 2 used.
const balance = {
  opening_balance_days: '3.00',
  carried_forward_days: '3.00',
  accrued_days: '7.00',
  entitlement_days: '21.00',
  allocated_days: '21.00',
  adjusted_days: '1.00',
  used_days: '2.00',
  pending_days: '0.50',
  approved_future_days: '0',
  expired_days: '0',
  attendance_deduction_days: '0',
} as LeaveBalance;

describe('calculateAvailableLeaveDays (one formula for every screen and check)', () => {
  it('uses accrued-to-date by default (available now)', () => {
    expect(calculateAvailableLeaveDays(balance)).toBe(3 + 7 + 1 - 2 - 0.5);
  });

  it('lets a caller plug in accrual as of another date (bookable)', () => {
    expect(calculateAvailableLeaveDays(balance, { accruedDays: 10.5 })).toBe(
      3 + 10.5 + 1 - 2 - 0.5,
    );
  });

  it('falls back to the entitlement for legacy rows with no accrual', () => {
    expect(
      calculateAvailableLeaveDays({ ...balance, accrued_days: '0' } as never),
    ).toBe(3 + 21 + 1 - 2 - 0.5);
  });
});

describe('LeaveBalanceLedgerService available figures', () => {
  const ledger = Object.create(
    LeaveBalanceLedgerService.prototype,
  ) as LeaveBalanceLedgerService;

  it('records history with the same "available now" the screens show', () => {
    expect(ledger.calculateAvailableDays(balance)).toBe(
      calculateAvailableLeaveDays(balance),
    );
  });

  it('keeps the full-year entitlement only as the reservation ceiling', () => {
    expect(ledger.calculateYearCeilingDays(balance)).toBe(3 + 21 + 1 - 2 - 0.5);
  });
});

describe('isLeaveBalanceVisibleForEmployee', () => {
  const female = { gender_restriction: LeaveGenderRestrictionEnum.FEMALE };
  const any = { gender_restriction: LeaveGenderRestrictionEnum.ANY };
  const unused = { used_days: '0.00', pending_days: '0.00' };

  it('hides an unused balance of a type restricted to the other gender', () => {
    expect(
      isLeaveBalanceVisibleForEmployee(
        { gender: 'male' },
        { ...unused, leave_type: female },
      ),
    ).toBe(false);
  });

  it('shows matching-gender and unrestricted types', () => {
    expect(
      isLeaveBalanceVisibleForEmployee(
        { gender: 'Female' },
        { ...unused, leave_type: female },
      ),
    ).toBe(true);
    expect(
      isLeaveBalanceVisibleForEmployee(
        { gender: 'male' },
        { ...unused, leave_type: any },
      ),
    ).toBe(true);
  });

  it('shows everything when the employee has no gender', () => {
    expect(
      isLeaveBalanceVisibleForEmployee(
        { gender: null },
        { ...unused, leave_type: female },
      ),
    ).toBe(true);
  });

  it('keeps a wrong-gender balance visible once it has activity', () => {
    expect(
      isLeaveBalanceVisibleForEmployee(
        { gender: 'male' },
        { used_days: '2.00', leave_type: female },
      ),
    ).toBe(true);
  });
});
