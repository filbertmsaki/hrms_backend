import { dayBefore, splitLeaveByPayBands } from './payroll-leave-bands.util';

describe('splitLeaveByPayBands', () => {
  const bands = [
    { days: 3, pay_percent: 100 },
    { days: 4, pay_percent: 50 },
    { days: 3, pay_percent: 0 },
  ];

  it('pays a request contained in one period across all bands', () => {
    expect(splitLeaveByPayBands(bands, 0, 10)).toEqual({
      paidEquivalentDays: 5,
      unpaidEquivalentDays: 5,
    });
  });

  it('splits a cross-period request so the total is paid exactly once', () => {
    const first = splitLeaveByPayBands(bands, 0, 5); // 3 full + 2 half
    const second = splitLeaveByPayBands(bands, 5, 5); // 2 half + 3 unpaid
    expect(first.paidEquivalentDays).toBe(4);
    expect(second.paidEquivalentDays).toBe(1);
    expect(first.paidEquivalentDays + second.paidEquivalentDays).toBe(5);
    expect(first.unpaidEquivalentDays + second.unpaidEquivalentDays).toBe(5);
  });

  it('handles half-day slices and treats days beyond the bands as unpaid', () => {
    expect(splitLeaveByPayBands(bands, 2.5, 1)).toEqual({
      paidEquivalentDays: 0.75,
      unpaidEquivalentDays: 0.25,
    });
    expect(splitLeaveByPayBands(bands, 9, 3)).toEqual({
      paidEquivalentDays: 0,
      unpaidEquivalentDays: 3,
    });
  });

  it('computes the previous calendar day across month boundaries', () => {
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2026-01-01T00:00:00Z')).toBe('2025-12-31');
  });
});
