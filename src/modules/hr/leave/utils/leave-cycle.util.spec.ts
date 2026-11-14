import {
  anniversaryDailyAccrual,
  cycleAnniversary,
  detectLeaveCycle,
} from './leave-cycle.util';

describe('anniversary leave cycles', () => {
  it('detects consecutive annual cycles and accrues 184 elapsed days', () => {
    const cycle = detectLeaveCycle('2025-03-15', 12, '2025-09-15');
    expect(cycle).toEqual({
      cycleNumber: 1,
      startDate: '2025-03-15',
      endDate: '2026-03-14',
    });
    expect(
      anniversaryDailyAccrual(28, cycle.startDate, cycle.endDate, '2025-09-15'),
    ).toBe(14.1151);
    expect(
      anniversaryDailyAccrual(
        28,
        cycle.startDate,
        cycle.endDate,
        cycle.endDate,
      ),
    ).toBe(28);
    expect(detectLeaveCycle('2025-03-15', 12, '2026-03-15')).toEqual({
      cycleNumber: 2,
      startDate: '2026-03-15',
      endDate: '2027-03-14',
    });
  });

  it('clamps leap anniversaries without losing the original anchor', () => {
    expect(detectLeaveCycle('2024-02-29', 12, '2025-02-28')).toEqual({
      cycleNumber: 2,
      startDate: '2025-02-28',
      endDate: '2026-02-27',
    });
    expect(cycleAnniversary('2024-02-29', 48)).toBe('2028-02-29');
  });

  it('supports 36-month cycles and validates dates', () => {
    expect(detectLeaveCycle('2025-03-15', 36, '2028-03-14').endDate).toBe(
      '2028-03-14',
    );
    expect(() => detectLeaveCycle('2025-02-30', 12, '2026-01-01')).toThrow();
    expect(() => detectLeaveCycle('2025-03-15', 0, '2026-01-01')).toThrow();
    expect(() => detectLeaveCycle('2025-03-15', 12, '2025-03-14')).toThrow();
  });
});
