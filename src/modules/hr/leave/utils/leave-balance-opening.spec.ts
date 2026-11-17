import {
  calculateAvailableLeaveDays,
  openingOrCarriedDays,
} from './leave-balance-rules.util';

describe('openingOrCarriedDays', () => {
  it('does not let a "0.00" opening string hide carried-forward days', () => {
    expect(
      openingOrCarriedDays({
        opening_balance_days: '0.00',
        carried_forward_days: '5.00',
      }),
    ).toBe(5);
    expect(
      openingOrCarriedDays({
        opening_balance_days: '3.00',
        carried_forward_days: '5.00',
      }),
    ).toBe(3);
  });

  it('matches the available-days formula', () => {
    const balance = {
      opening_balance_days: '0.00',
      carried_forward_days: '5.00',
      accrued_days: '0.00',
      entitlement_days: '10.00',
      allocated_days: '10.00',
      adjusted_days: '0.00',
      used_days: '2.00',
      pending_days: '0.00',
      approved_future_days: '0.00',
      expired_days: '0.00',
      attendance_deduction_days: '0.00',
    };
    expect(calculateAvailableLeaveDays(balance)).toBe(13);
  });
});
