import { splitUnusedDays } from '../services/leave-rollover.service';
import { dailyProRataAccrual } from './leave-accrual.util';
import {
  isCalendarLeaveYear,
  leaveCycleForDate,
  leaveCycleForLabel,
} from './leave-cycle.util';
import { carryForwardDaysFor } from './leave-policy-calculations.util';
import {
  comparePolicyVersions,
  dayBefore,
  isPolicyEffectiveOn,
} from './leave-policy-version.util';

describe('leave cycles', () => {
  it('keeps the calendar year by default', () => {
    expect(leaveCycleForDate(null, '2026-07-15')).toEqual({
      label: '2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(isCalendarLeaveYear({ leave_year_type: 'calendar' })).toBe(true);
  });

  it('runs anniversary years from the hire date', () => {
    const config = { leave_year_type: 'anniversary' as const };
    expect(leaveCycleForDate(config, '2027-03-01', '2024-07-15')).toEqual({
      label: '2026',
      startDate: '2026-07-15',
      endDate: '2027-07-14',
    });
    expect(leaveCycleForDate(config, '2027-07-15', '2024-07-15').label).toBe(
      '2027',
    );
    expect(isCalendarLeaveYear(config, '2024-07-15')).toBe(false);
  });

  it('falls back to the calendar year when an anniversary has no hire date', () => {
    expect(
      leaveCycleForDate({ leave_year_type: 'anniversary' }, '2026-05-05', null)
        .startDate,
    ).toBe('2026-01-01');
  });

  it('runs custom years from a configured start', () => {
    const config = {
      leave_year_type: 'custom' as const,
      leave_year_start_month: 7,
      leave_year_start_day: 1,
    };
    expect(leaveCycleForDate(config, '2026-06-30')).toEqual({
      label: '2025',
      startDate: '2025-07-01',
      endDate: '2026-06-30',
    });
    expect(leaveCycleForLabel(config, '2026').endDate).toBe('2027-06-30');
  });

  it('clamps a 29 February anniversary in non-leap years', () => {
    const config = { leave_year_type: 'anniversary' as const };
    expect(leaveCycleForLabel(config, '2025', '2024-02-29')).toEqual({
      label: '2025',
      startDate: '2025-02-28',
      endDate: '2026-02-27',
    });
    expect(leaveCycleForLabel(config, '2028', '2024-02-29').startDate).toBe(
      '2028-02-29',
    );
  });

  it('accrues daily within a custom cycle', () => {
    // Half of a 365-day cycle elapsed (Jul 1 → Dec 30 = 183 days).
    const value = dailyProRataAccrual({
      entitlementDays: 28,
      year: '2026',
      asOf: '2026-12-30',
      periodStart: '2026-07-01',
      periodEnd: '2027-06-30',
    });
    expect(value).toBeCloseTo((28 * 183) / 365, 6);
  });
});

describe('carryForwardDaysFor', () => {
  it('carries all, a limit or a percentage (then the limit)', () => {
    expect(carryForwardDaysFor(10, { enabled: true, maxDays: null })).toBe(10);
    expect(carryForwardDaysFor(10, { enabled: true, maxDays: 7 })).toBe(7);
    expect(
      carryForwardDaysFor(10, {
        enabled: true,
        maxDays: null,
        method: 'percentage',
        percentage: 50,
      }),
    ).toBe(5);
    expect(
      carryForwardDaysFor(10, {
        enabled: true,
        maxDays: 3,
        method: 'percentage',
        percentage: 50,
      }),
    ).toBe(3);
    expect(
      carryForwardDaysFor(10, { enabled: true, maxDays: 7, method: 'all' }),
    ).toBe(10);
  });

  it('carries nothing when disabled or nothing is unused', () => {
    expect(carryForwardDaysFor(10, { enabled: false, maxDays: null })).toBe(0);
    expect(carryForwardDaysFor(-2, { enabled: true, maxDays: null })).toBe(0);
  });
});

describe('splitUnusedDays (rollover order: carry → encash → lapse/retain)', () => {
  const base = {
    unused: 10,
    carry: 7,
    protectedMinimum: 0,
    autoEncash: null,
    lapseAllowed: true,
  };

  it('matches the example: 10 unused, 7 carried, 3 lapse', () => {
    expect(splitUnusedDays(base)).toEqual({
      unused: 10,
      protected: 0,
      carry: 7,
      encash: 0,
      lapse: 3,
      retained: 0,
    });
  });

  it('retains instead of lapsing when lapse is not allowed', () => {
    expect(splitUnusedDays({ ...base, lapseAllowed: false })).toMatchObject({
      lapse: 0,
      retained: 3,
    });
  });

  it('never lapses protected days not covered by carry or encash', () => {
    expect(
      splitUnusedDays({ ...base, carry: 2, protectedMinimum: 6 }),
    ).toMatchObject({ carry: 2, retained: 4, lapse: 4 });
  });

  it('encashes what is left, by method and limit', () => {
    expect(
      splitUnusedDays({
        ...base,
        autoEncash: {
          enabled: true,
          method: 'all',
          maxDays: null,
          percentage: null,
        },
      }),
    ).toMatchObject({ encash: 3, lapse: 0 });
    expect(
      splitUnusedDays({
        ...base,
        autoEncash: {
          enabled: true,
          method: 'limited',
          maxDays: 1,
          percentage: null,
        },
      }),
    ).toMatchObject({ encash: 1, lapse: 2 });
    expect(
      splitUnusedDays({
        ...base,
        autoEncash: {
          enabled: true,
          method: 'percentage',
          maxDays: null,
          percentage: 50,
        },
      }),
    ).toMatchObject({ encash: 1.5, lapse: 1.5 });
  });

  it('always adds up to the unused days', () => {
    const cases = [
      { ...base, carry: 0, protectedMinimum: 10 },
      { ...base, carry: 12 },
      { ...base, unused: 0 },
      {
        ...base,
        carry: 1,
        protectedMinimum: 4,
        lapseAllowed: false,
        autoEncash: {
          enabled: true,
          method: 'percentage' as const,
          maxDays: 2,
          percentage: 30,
        },
      },
    ];
    for (const input of cases) {
      const split = splitUnusedDays(input);
      expect(
        Math.round(
          (split.carry + split.encash + split.lapse + split.retained) * 100,
        ) / 100,
      ).toBe(split.unused);
    }
  });
});

describe('policy versions', () => {
  it('applies a version only inside its effective dates and when approved', () => {
    const v = { effective_from: '2026-01-01', effective_to: '2026-06-30' };
    expect(isPolicyEffectiveOn(v, '2026-03-01')).toBe(true);
    expect(isPolicyEffectiveOn(v, '2026-07-01')).toBe(false);
    expect(
      isPolicyEffectiveOn(
        { effective_from: null, effective_to: null },
        '1999-01-01',
      ),
    ).toBe(true);
    expect(
      isPolicyEffectiveOn({ ...v, lifecycle_status: 'draft' }, '2026-03-01'),
    ).toBe(false);
    expect(
      isPolicyEffectiveOn(
        { ...v, lifecycle_status: 'superseded' },
        '2026-03-01',
      ),
    ).toBe(true);
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
  });

  it('lists field and leave-type differences', () => {
    const changes = comparePolicyVersions(
      {
        name: 'Standard',
        maximum_accumulation_days: '0.00',
        leave_year_type: 'calendar',
        leave_types: [
          {
            leave_type_id: 1,
            annual_quota_days: '21.00',
            carry_forward_max_days: '5.00',
          },
          { leave_type_id: 2, annual_quota_days: '7.00' },
        ],
      } as never,
      {
        name: 'Standard',
        maximum_accumulation_days: '40.00',
        leave_year_type: 'anniversary',
        leave_types: [
          {
            leave_type_id: 1,
            annual_quota_days: '28.00',
            carry_forward_max_days: '5',
          },
          { leave_type_id: 3, annual_quota_days: '3.00' },
        ],
      } as never,
    );
    expect(changes).toEqual(
      expect.arrayContaining([
        { field: 'maximum_accumulation_days', before: 0, after: 40 },
        { field: 'leave_year_type', before: 'calendar', after: 'anniversary' },
        { field: 'annual_quota_days', leave_type_id: 1, before: 21, after: 28 },
        {
          field: 'leave_type_removed',
          leave_type_id: 2,
          before: 7,
          after: null,
        },
        { field: 'leave_type_added', leave_type_id: 3, before: null, after: 3 },
      ]),
    );
    expect(
      changes.find((c) => c.field === 'carry_forward_max_days'),
    ).toBeUndefined();
  });
});
