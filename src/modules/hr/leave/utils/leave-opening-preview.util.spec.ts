import type { LeaveBalance } from '../entities/leave-balance.entity';
import { previewLegacyOpeningBalance } from './leave-opening-preview.util';

describe('legacy opening-balance preview', () => {
  const balance = {
    opening_balance_days: '5.00',
    carried_forward_days: '5.00',
    accrued_days: '12.25',
    entitlement_days: '28.00',
    allocated_days: '28.00',
    adjusted_days: '-0.50',
    used_days: '3.00',
    expired_days: '1.00',
    attendance_deduction_days: '0.25',
    pending_days: '2.00',
    approved_future_days: '4.00',
  } as LeaveBalance;

  it('separately reports reservations, without subtracting or double-counting carry-over', () => {
    const result = previewLegacyOpeningBalance(balance);
    expect(result.candidate_days).toBe('12.5000');
    expect(result.pending_days).toBe('2.0000');
    expect(result.scheduled_days).toBe('4.0000');
    expect(result.issues).toContain('not_an_as_of_balance');
  });

  it('flags ambiguous legacy zero accrual and missing values for review', () => {
    const result = previewLegacyOpeningBalance({
      ...balance,
      accrued_days: '0',
      opening_balance_days: '0',
      adjusted_days: null,
    } as unknown as LeaveBalance);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'zero_accrual_requires_review',
        'legacy_opening_fallback',
        'missing_adjusted_days',
      ]),
    );
  });
});
