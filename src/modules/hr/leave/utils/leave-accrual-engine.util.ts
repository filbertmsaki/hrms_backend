/**
 * Leave accrual engine (pure). One function decides how many days of a leave
 * cycle's entitlement have been earned by a date, for every accrual
 * frequency. Always derived from dates — never incremented — so running it
 * again with the same inputs gives the same answer (no rounding drift, no
 * duplicate credits).
 *
 * Accrual start is separate from eligibility to apply: it is either the hire
 * date or the day after the employee's effective probation completion
 * (confirmation), per the leave type's policy.
 */

export type AccrualFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'manual';
/** in_advance: credited when a period starts; in_arrears: once it has ended. */
export type AccrualTiming = 'in_advance' | 'in_arrears';
export type AccrualStartBasis = 'hire_date' | 'probation_completion';

const DAY_MS = 86_400_000;
const WEEKS_PER_YEAR = 52;

const ms = (iso: string | Date) =>
  Date.parse(
    `${(iso instanceof Date ? iso.toISOString() : String(iso)).slice(0, 10)}T00:00:00Z`,
  );
const iso = (value: number) => new Date(value).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => iso(ms(date) + days * DAY_MS);
const daysBetweenInclusive = (a: number, b: number) =>
  Math.round((b - a) / DAY_MS) + 1;

export type ProbationFacts = {
  hire_date?: string | Date | null;
  probation_start_date?: string | Date | null;
  probation_end_date?: string | Date | null;
  confirmation_due_date?: string | Date | null;
  confirmation_date?: string | Date | null;
  confirmation_status?: string | null;
};

export type AccrualStart = {
  /** First day leave is earned; null → not accruing yet (or never). */
  date: string | null;
  /** probation status shown to HR and the employee */
  probation: 'not_applicable' | 'on_probation' | 'confirmed' | 'not_confirmed';
  /** For employees still on probation: the day accrual is expected to start. */
  expected_date: string | null;
  reason: string;
};

const ENDED_WITHOUT_CONFIRMATION = ['NOT_CONFIRMED', 'TERMINATION_RECOMMENDED'];

/**
 * First day of accrual. For probation_completion: the day after the
 * effective (approved) confirmation date — early confirmations and
 * extensions are already reflected in the employee's confirmation fields by
 * the probation module. A nominal end date alone never starts accrual.
 */
export function resolveAccrualStart(
  employee: ProbationFacts,
  basis: AccrualStartBasis,
): AccrualStart {
  const hire = employee.hire_date ? iso(ms(employee.hire_date)) : null;
  if (basis === 'hire_date')
    return {
      date: hire,
      probation: 'not_applicable',
      expected_date: null,
      reason: hire ? 'Accrues from the hire date.' : 'No hire date recorded.',
    };
  const status = employee.confirmation_status ?? 'NOT_APPLICABLE';
  const hasProbation =
    status !== 'NOT_APPLICABLE' || !!employee.probation_end_date;
  if (!hasProbation)
    return {
      date: hire,
      probation: 'not_applicable',
      expected_date: null,
      reason: 'No probation period: accrues from the hire date.',
    };
  if (status === 'CONFIRMED' && employee.confirmation_date) {
    const confirmed = iso(ms(employee.confirmation_date));
    return {
      date: addDays(confirmed, 1),
      probation: 'confirmed',
      expected_date: null,
      reason: `Probation confirmed on ${confirmed}: accrues from the next day.`,
    };
  }
  if (ENDED_WITHOUT_CONFIRMATION.includes(status))
    return {
      date: null,
      probation: 'not_confirmed',
      expected_date: null,
      reason: 'Probation ended without confirmation: no accrual.',
    };
  const due = employee.probation_end_date ?? employee.confirmation_due_date;
  return {
    date: null,
    // PROBATION / CONFIRMATION_DUE / PROBATION_EXTENDED, or CONFIRMED
    // without a recorded date: not accruing until a confirmation date exists.
    probation: 'on_probation',
    expected_date: due ? addDays(iso(ms(due)), 1) : null,
    reason: due
      ? `On probation until ${iso(ms(due))}: accrual starts once confirmed.`
      : 'On probation: accrual starts once confirmed.',
  };
}

export type AccrualInput = {
  frequency: AccrualFrequency;
  entitlementDays: number;
  /** Leave cycle (calendar / anniversary / custom year). */
  cycleStart: string;
  cycleEnd: string;
  /** From resolveAccrualStart; null → nothing earned. */
  accrualStart: string | null;
  /** Exit / termination date — accrual stops after it. */
  accrualEnd?: string | Date | null;
  asOf: string;
  timing?: AccrualTiming;
  /** Monthly: fixed days per month instead of entitlement ÷ 12. */
  monthlyRate?: number | null;
  /** Yearly: pro-rate the credit for a partial first cycle. */
  prorate?: boolean;
  /** Manual frequency keeps whatever HR posted. */
  existingAccruedDays?: number;
};

export type AccrualResult = {
  /** Earned so far (full precision; round for display/storage). */
  accrued: number;
  /** Periods credited so far (days / weeks / months / 0-1 for yearly). */
  periods: number;
  /** Next date a credit is due within this cycle, if any. */
  next_accrual_date: string | null;
  /** Amount of that next credit. */
  next_accrual_amount: number;
};

/**
 * Days earned in one leave cycle by `asOf` under the given frequency.
 * Never exceeds the entitlement. Periods are counted from the later of the
 * cycle start and the accrual start, so mid-cycle hires and confirmations
 * earn only what falls after their start.
 */
export function computeAccrual(input: AccrualInput): AccrualResult {
  const none = (next: string | null = null, amount = 0): AccrualResult => ({
    accrued: 0,
    periods: 0,
    next_accrual_date: next,
    next_accrual_amount: amount,
  });
  const E = Math.max(0, input.entitlementDays);
  if (input.frequency === 'manual')
    return {
      accrued: input.existingAccruedDays ?? 0,
      periods: 0,
      next_accrual_date: null,
      next_accrual_amount: 0,
    };
  if (!input.accrualStart || E === 0) return none();

  const cycleStart = ms(input.cycleStart);
  const cycleEnd = ms(input.cycleEnd);
  const start = Math.max(cycleStart, ms(input.accrualStart));
  const stop = Math.min(
    cycleEnd,
    input.accrualEnd ? ms(input.accrualEnd) : Number.POSITIVE_INFINITY,
  );
  const asOf = ms(input.asOf);
  const timing = input.timing ?? 'in_advance';
  if (start > stop) return none();
  const cycleDays = daysBetweenInclusive(cycleStart, cycleEnd);
  const cap = (n: number) => Math.min(E, Math.max(0, n));

  if (input.frequency === 'daily') {
    const perDay = E / cycleDays;
    const upTo = Math.min(stop, asOf);
    const days = upTo < start ? 0 : daysBetweenInclusive(start, upTo);
    const next = upTo < stop ? Math.max(start, asOf + DAY_MS) : null;
    return {
      accrued: cap(perDay * days),
      periods: days,
      next_accrual_date: next === null ? null : iso(next),
      next_accrual_amount: next === null ? 0 : perDay,
    };
  }

  if (input.frequency === 'weekly') {
    // 7-day periods anchored on the accrual start; E ÷ 52 per week.
    const perWeek = E / WEEKS_PER_YEAR;
    const weeksInWindow = Math.ceil(daysBetweenInclusive(start, stop) / 7);
    let credited = 0;
    for (let w = 0; w < weeksInWindow; w++) {
      const weekStart = start + w * 7 * DAY_MS;
      const weekEnd = Math.min(weekStart + 6 * DAY_MS, stop);
      const due = timing === 'in_advance' ? weekStart : weekEnd;
      if (due <= asOf) credited++;
    }
    const nextIndex = credited < weeksInWindow ? credited : null;
    const nextDate =
      nextIndex === null
        ? null
        : timing === 'in_advance'
          ? start + nextIndex * 7 * DAY_MS
          : Math.min(start + (nextIndex * 7 + 6) * DAY_MS, stop);
    const accrued = cap(perWeek * credited);
    return {
      accrued,
      periods: credited,
      next_accrual_date:
        nextDate === null || accrued >= E ? null : iso(nextDate),
      next_accrual_amount:
        nextDate === null || accrued >= E ? 0 : Math.min(perWeek, E - accrued),
    };
  }

  if (input.frequency === 'monthly') {
    // Calendar months inside the accrual window; a partial first/last month
    // counts as a full month when credited in advance (long-standing rule),
    // and only once it has ended when credited in arrears.
    const perMonth =
      input.monthlyRate && input.monthlyRate > 0 ? input.monthlyRate : E / 12;
    const first = new Date(start);
    let credited = 0;
    let nextDate: number | null = null;
    for (let m = 0; m < 24; m++) {
      const monthStart = Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth() + m,
        1,
      );
      if (monthStart > stop) break;
      const monthEnd = Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth() + m + 1,
        0,
      );
      const due =
        timing === 'in_advance'
          ? Math.max(monthStart, start)
          : Math.min(monthEnd, stop);
      if (due <= asOf) credited++;
      else if (nextDate === null) nextDate = due;
    }
    const accrued = cap(perMonth * credited);
    return {
      accrued,
      periods: credited,
      next_accrual_date:
        nextDate === null || accrued >= E ? null : iso(nextDate),
      next_accrual_amount:
        nextDate === null || accrued >= E ? 0 : Math.min(perMonth, E - accrued),
    };
  }

  // Yearly: one credit per cycle — at the start of the eligible period
  // (in advance, i.e. upfront) or at cycle end (in arrears); optionally
  // pro-rated for a partial first cycle.
  const share = input.prorate
    ? daysBetweenInclusive(start, stop) / cycleDays
    : 1;
  const amount = cap(E * share);
  const due = timing === 'in_advance' ? start : stop;
  return due <= asOf
    ? {
        accrued: amount,
        periods: 1,
        next_accrual_date: null,
        next_accrual_amount: 0,
      }
    : {
        accrued: 0,
        periods: 0,
        next_accrual_date: iso(due),
        next_accrual_amount: amount,
      };
}
