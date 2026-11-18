import { LeaveBalance } from '../entities/leave-balance.entity';
import { cycleEndOf, cycleStartOf } from './leave-carry-forward.service';
import { LeaveBalanceService } from './leave-balance.service';
import { leaveCycleHasEnded } from './leave-rollover.service';
import { leaveCycleForDate } from '../utils/leave-cycle.util';

const expiry = LeaveBalanceService.prototype.carryForwardExpiryDate;
const rules = (r: Record<string, unknown>) => r as never;

const bal = (fiscal_year: string, start?: string, end?: string) =>
  ({
    fiscal_year,
    leave_year_start_date: start ?? null,
    leave_year_end_date: end ?? null,
  }) as unknown as LeaveBalance;

describe('leave-year aware carry-forward scheduling', () => {
  it('calendar balances keep 1 Jan – 31 Dec', () => {
    expect(cycleStartOf(bal('2026'))).toBe('2026-01-01');
    expect(cycleEndOf(bal('2026'))).toBe('2026-12-31');
    expect(expiry(rules({ expiryMonths: 3 }), '2026')).toBe('2026-03-31');
    expect(expiry(rules({ expiryDate: '06-30' }), '2026')).toBe('2026-06-30');
  });

  it('anniversary cycle: expiry counts from the cycle start', () => {
    // Hired 15 Aug: cycle 2026-08-15 .. 2027-08-14
    expect(expiry(rules({ expiryMonths: 3 }), '2026', '2026-08-15')).toBe(
      '2026-10-31',
    );
    // A fixed 30 Jun expiry is the first one after the cycle start.
    expect(expiry(rules({ expiryDate: '06-30' }), '2026', '2026-08-15')).toBe(
      '2027-06-30',
    );
  });

  it('custom cycle (1 Jul) crossing the calendar year', () => {
    expect(expiry(rules({ expiryMonths: 6 }), '2026', '2026-07-01')).toBe(
      '2026-12-31',
    );
    expect(expiry(rules({ expiryMonths: 9 }), '2026', '2026-07-01')).toBe(
      '2027-03-31',
    );
  });

  it('rollover only takes balances whose own cycle has ended', () => {
    const today = '2027-01-05';
    expect(leaveCycleHasEnded(bal('2026'), today)).toBe(true);
    expect(
      leaveCycleHasEnded(bal('2026', '2026-08-15', '2027-08-14'), today),
    ).toBe(false);
    expect(
      leaveCycleHasEnded(bal('2025', '2025-08-15', '2026-08-14'), today),
    ).toBe(true);
  });

  it('29 Feb anniversary resolves to 28 Feb in non-leap years', () => {
    const cycle = leaveCycleForDate(
      { leave_year_type: 'anniversary' },
      '2027-03-10',
      '2024-02-29',
    );
    expect(cycle.startDate).toBe('2027-02-28');
    expect(cycle.endDate).toBe('2028-02-28');
  });
});
