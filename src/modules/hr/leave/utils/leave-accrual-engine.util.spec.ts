import {
  computeAccrual,
  resolveAccrualStart,
} from './leave-accrual-engine.util';

const year = { cycleStart: '2026-01-01', cycleEnd: '2026-12-31' };
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('resolveAccrualStart (probation)', () => {
  it('hire-date basis ignores probation', () => {
    expect(
      resolveAccrualStart(
        {
          hire_date: '2026-01-01',
          confirmation_status: 'PROBATION',
          probation_end_date: '2026-06-30',
        },
        'hire_date',
      ).date,
    ).toBe('2026-01-01');
  });

  it('no probation → hire date', () => {
    const s = resolveAccrualStart(
      { hire_date: '2026-01-01', confirmation_status: 'NOT_APPLICABLE' },
      'probation_completion',
    );
    expect(s).toMatchObject({
      date: '2026-01-01',
      probation: 'not_applicable',
    });
  });

  it('6-month probation confirmed 30 Jun → accrues from 1 Jul', () => {
    const s = resolveAccrualStart(
      {
        hire_date: '2026-01-01',
        probation_end_date: '2026-06-30',
        confirmation_status: 'CONFIRMED',
        confirmation_date: '2026-06-30',
      },
      'probation_completion',
    );
    expect(s).toMatchObject({ date: '2026-07-01', probation: 'confirmed' });
  });

  it('early confirmation uses the actual approved date', () => {
    expect(
      resolveAccrualStart(
        {
          hire_date: '2026-01-01',
          probation_end_date: '2026-06-30',
          confirmation_status: 'CONFIRMED',
          confirmation_date: '2026-05-15',
        },
        'probation_completion',
      ).date,
    ).toBe('2026-05-16');
  });

  it('still on probation (or extended) → not accruing, expected start shown', () => {
    for (const status of [
      'PROBATION',
      'CONFIRMATION_DUE',
      'PROBATION_EXTENDED',
    ]) {
      const s = resolveAccrualStart(
        {
          hire_date: '2026-01-01',
          probation_end_date:
            status === 'PROBATION_EXTENDED' ? '2026-09-30' : '2026-03-31',
          confirmation_status: status,
        },
        'probation_completion',
      );
      expect(s.date).toBeNull();
      expect(s.probation).toBe('on_probation');
      expect(s.expected_date).toBe(
        status === 'PROBATION_EXTENDED' ? '2026-10-01' : '2026-04-01',
      );
    }
  });

  it('nominal end date passed but not confirmed → still no accrual', () => {
    expect(
      resolveAccrualStart(
        {
          hire_date: '2026-01-01',
          probation_end_date: '2026-03-31',
          confirmation_status: 'CONFIRMATION_DUE',
        },
        'probation_completion',
      ).date,
    ).toBeNull();
  });

  it('not confirmed → never accrues', () => {
    expect(
      resolveAccrualStart(
        {
          hire_date: '2026-01-01',
          probation_end_date: '2026-03-31',
          confirmation_status: 'NOT_CONFIRMED',
        },
        'probation_completion',
      ),
    ).toMatchObject({ date: null, probation: 'not_confirmed' });
  });
});

describe('computeAccrual', () => {
  const base = { entitlementDays: 28, ...year, accrualStart: '2026-01-01' };

  it('daily: 28 ÷ 365 per eligible day, full precision', () => {
    const r = computeAccrual({
      ...base,
      frequency: 'daily',
      asOf: '2026-01-10',
    });
    close(r.accrued, (28 / 365) * 10);
    expect(r.next_accrual_date).toBe('2026-01-11');
    close(r.next_accrual_amount, 28 / 365);
  });

  it('daily: whole year = exactly the entitlement (no rounding drift)', () => {
    close(
      computeAccrual({ ...base, frequency: 'daily', asOf: '2026-12-31' })
        .accrued,
      28,
    );
  });

  it('daily: leap year divides by 366', () => {
    const r = computeAccrual({
      ...base,
      frequency: 'daily',
      cycleStart: '2028-01-01',
      cycleEnd: '2028-12-31',
      accrualStart: '2028-01-01',
      asOf: '2028-02-29',
    });
    close(r.accrued, (28 / 366) * 60);
  });

  it('weekly in arrears: 28 ÷ 52 per completed week', () => {
    // Weeks from 1 Jan: 1–7, 8–14, 15–21 completed by 21 Jan.
    const r = computeAccrual({
      ...base,
      frequency: 'weekly',
      timing: 'in_arrears',
      asOf: '2026-01-21',
    });
    close(r.accrued, (28 / 52) * 3);
    expect(r.periods).toBe(3);
    expect(r.next_accrual_date).toBe('2026-01-28');
  });

  it('weekly in advance credits the week on its first day', () => {
    close(
      computeAccrual({
        ...base,
        frequency: 'weekly',
        timing: 'in_advance',
        asOf: '2026-01-08',
      }).accrued,
      (28 / 52) * 2,
    );
  });

  it('weekly never exceeds the entitlement (53rd partial week)', () => {
    expect(
      computeAccrual({
        ...base,
        frequency: 'weekly',
        timing: 'in_advance',
        asOf: '2026-12-31',
      }).accrued,
    ).toBe(28);
  });

  it('monthly in advance (existing rule): current month credited', () => {
    const r = computeAccrual({
      ...base,
      frequency: 'monthly',
      asOf: '2026-04-15',
    });
    close(r.accrued, (28 / 12) * 4);
    expect(r.next_accrual_date).toBe('2026-05-01');
  });

  it('monthly in arrears: only completed months', () => {
    const r = computeAccrual({
      ...base,
      frequency: 'monthly',
      timing: 'in_arrears',
      asOf: '2026-04-15',
    });
    close(r.accrued, (28 / 12) * 3);
    expect(r.next_accrual_date).toBe('2026-04-30');
  });

  it('monthly: twelve months = entitlement exactly', () => {
    expect(
      computeAccrual({
        ...base,
        frequency: 'monthly',
        timing: 'in_arrears',
        asOf: '2026-12-31',
      }).accrued,
    ).toBe(28);
  });

  it('probation example: confirmed 30 Jun, monthly → 0 before July, 6 months by year end', () => {
    const start = '2026-07-01';
    expect(
      computeAccrual({
        ...base,
        accrualStart: start,
        frequency: 'monthly',
        timing: 'in_arrears',
        asOf: '2026-06-30',
      }).accrued,
    ).toBe(0);
    close(
      computeAccrual({
        ...base,
        accrualStart: start,
        frequency: 'monthly',
        timing: 'in_arrears',
        asOf: '2026-12-31',
      }).accrued,
      14,
    );
  });

  it('still on probation → nothing earned', () => {
    expect(
      computeAccrual({
        ...base,
        accrualStart: null,
        frequency: 'monthly',
        asOf: '2026-12-31',
      }).accrued,
    ).toBe(0);
  });

  it('mid-month hire: monthly in advance counts the hire month', () => {
    close(
      computeAccrual({
        ...base,
        accrualStart: '2026-03-20',
        frequency: 'monthly',
        asOf: '2026-04-01',
      }).accrued,
      (28 / 12) * 2,
    );
  });

  it('termination mid-period stops accrual at the exit date', () => {
    const r = computeAccrual({
      ...base,
      frequency: 'daily',
      accrualEnd: '2026-01-31',
      asOf: '2026-03-01',
    });
    close(r.accrued, (28 / 365) * 31);
    expect(r.next_accrual_date).toBeNull();
  });

  it('anniversary cycle crossing calendar years', () => {
    const r = computeAccrual({
      entitlementDays: 28,
      cycleStart: '2026-07-01',
      cycleEnd: '2027-06-30',
      accrualStart: '2026-07-01',
      frequency: 'monthly',
      timing: 'in_arrears',
      asOf: '2027-01-31',
    });
    close(r.accrued, (28 / 12) * 7);
  });

  it('yearly in advance = upfront at the start of the eligible period', () => {
    expect(
      computeAccrual({ ...base, frequency: 'yearly', asOf: '2026-01-01' })
        .accrued,
    ).toBe(28);
  });

  it('yearly in arrears credits only at cycle end', () => {
    const before = computeAccrual({
      ...base,
      frequency: 'yearly',
      timing: 'in_arrears',
      asOf: '2026-12-30',
    });
    expect(before.accrued).toBe(0);
    expect(before.next_accrual_date).toBe('2026-12-31');
    expect(
      computeAccrual({
        ...base,
        frequency: 'yearly',
        timing: 'in_arrears',
        asOf: '2026-12-31',
      }).accrued,
    ).toBe(28);
  });

  it('yearly prorated for a partial first cycle', () => {
    const r = computeAccrual({
      ...base,
      accrualStart: '2026-07-01',
      frequency: 'yearly',
      prorate: true,
      asOf: '2026-07-01',
    });
    close(r.accrued, (28 * 184) / 365);
  });

  it('manual keeps what HR posted', () => {
    expect(
      computeAccrual({
        ...base,
        frequency: 'manual',
        existingAccruedDays: 4.5,
        asOf: '2026-05-01',
      }).accrued,
    ).toBe(4.5);
  });

  it('is idempotent: same inputs, same answer', () => {
    const input = {
      ...base,
      frequency: 'monthly' as const,
      asOf: '2026-08-09',
    };
    expect(computeAccrual(input)).toEqual(computeAccrual(input));
  });

  it('sick leave entitlement model (126 days, yearly in advance) is available in full', () => {
    expect(
      computeAccrual({
        ...base,
        entitlementDays: 126,
        frequency: 'yearly',
        asOf: '2026-02-01',
      }).accrued,
    ).toBe(126);
  });

  it('sick leave monthly accrual policy credits 126 ÷ 12 per month', () => {
    close(
      computeAccrual({
        ...base,
        entitlementDays: 126,
        frequency: 'monthly',
        timing: 'in_arrears',
        asOf: '2026-02-28',
      }).accrued,
      21,
    );
  });
});
