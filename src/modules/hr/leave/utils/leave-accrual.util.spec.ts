import {
  accrualPeriodEnd,
  dailyProRataAccrual,
  daysInLeaveYear,
  roundLeaveDays,
} from './leave-accrual.util';

describe('daily pro-rata leave accrual', () => {
  const base = { entitlementDays: 28, year: '2026' };

  it('accrues the full entitlement over a full leave year', () => {
    expect(dailyProRataAccrual({ ...base, asOf: '2026-12-31' })).toBeCloseTo(
      28,
      10,
    );
  });

  it('accrues about 2.33 days for a full 30-day month', () => {
    const april = dailyProRataAccrual({
      ...base,
      asOf: '2026-04-30',
      employmentStartDate: '2026-04-01',
    });
    expect(roundLeaveDays(april)).toBe(2.3);
    // 31-day month
    const may =
      dailyProRataAccrual({ ...base, asOf: '2026-05-31' }) -
      dailyProRataAccrual({ ...base, asOf: '2026-04-30' });
    expect(roundLeaveDays(may)).toBe(2.38);
  });

  it('has no cumulative rounding drift across daily recalculation', () => {
    let previous = 0;
    let summedDaily = 0;
    for (let day = 0; day < 365; day += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + day))
        .toISOString()
        .slice(0, 10);
      const accrued = dailyProRataAccrual({ ...base, asOf: date });
      summedDaily += accrued - previous;
      previous = accrued;
    }
    expect(summedDaily).toBeCloseTo(28, 9);
  });

  it('starts accruing on the employment start date for new joiners', () => {
    expect(
      dailyProRataAccrual({
        ...base,
        asOf: '2026-06-30',
        employmentStartDate: '2026-07-01',
      }),
    ).toBe(0);
    expect(
      dailyProRataAccrual({
        ...base,
        asOf: '2026-12-31',
        employmentStartDate: '2026-07-01',
      }),
    ).toBeCloseTo((28 * 184) / 365, 10);
  });

  it('stops accruing at the exit date', () => {
    expect(
      dailyProRataAccrual({
        ...base,
        asOf: '2026-12-31',
        employmentEndDate: '2026-03-31',
      }),
    ).toBeCloseTo((28 * 90) / 365, 10);
  });

  it('uses 366 days in a leap year', () => {
    expect(daysInLeaveYear('2028')).toBe(366);
    expect(
      dailyProRataAccrual({
        entitlementDays: 28,
        year: '2028',
        asOf: '2028-12-31',
      }),
    ).toBeCloseTo(28, 10);
  });

  it('computes day, week (Mon–Sun), month and year period ends', () => {
    // 2026-11-05 is a Thursday
    expect(accrualPeriodEnd('2026-11-05', 'day')).toBe('2026-11-05');
    expect(accrualPeriodEnd('2026-11-05', 'week')).toBe('2026-11-08');
    expect(accrualPeriodEnd('2026-11-08', 'week')).toBe('2026-11-08');
    expect(accrualPeriodEnd('2026-02-10', 'month')).toBe('2026-02-28');
    expect(accrualPeriodEnd('2026-11-05', 'year')).toBe('2026-12-31');
  });
});
