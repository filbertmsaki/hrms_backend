/**
 * Daily pro-rata accrual: entitlement × eligible days ÷ days in the leave year.
 *
 * Always computed from dates (never incremented), so repeated recalculation
 * cannot accumulate rounding error; callers round only for display/storage.
 */

export type AccrualPeriod = 'day' | 'week' | 'month' | 'year';

const DAY_MS = 86_400_000;

/** Accepts an ISO date string or a Date (raw driver rows return Dates). */
function toUtcDate(value: string | Date): number {
  const iso =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value.slice(0, 10);
  return Date.parse(`${iso}T00:00:00Z`);
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysInLeaveYear(year: string): number {
  const y = Number(year);
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

/**
 * Accrued days for a leave year up to and including `asOf`. Accrual starts
 * on the later of the leave-year start and the employment start date and
 * stops at the exit date. The leave year is `year` (1 Jan–31 Dec) unless an
 * explicit cycle (anniversary or custom year) is given.
 */
export function dailyProRataAccrual(params: {
  entitlementDays: number;
  year: string;
  asOf: string;
  employmentStartDate?: string | Date | null;
  employmentEndDate?: string | Date | null;
  periodStart?: string;
  periodEnd?: string;
}): number {
  const yearStart = toUtcDate(params.periodStart ?? `${params.year}-01-01`);
  const yearEnd = toUtcDate(params.periodEnd ?? `${params.year}-12-31`);
  const periodDays = Math.round((yearEnd - yearStart) / DAY_MS) + 1;
  const start = Math.max(
    yearStart,
    params.employmentStartDate ? toUtcDate(params.employmentStartDate) : 0,
  );
  const end = Math.min(
    yearEnd,
    toUtcDate(params.asOf),
    params.employmentEndDate
      ? toUtcDate(params.employmentEndDate)
      : Number.POSITIVE_INFINITY,
  );
  if (end < start || params.entitlementDays <= 0) return 0;
  const eligibleDays = Math.round((end - start) / DAY_MS) + 1;
  return (params.entitlementDays * eligibleDays) / periodDays;
}

/** Last day of the day/week (Mon–Sun)/month/year containing `asOf`. */
export function accrualPeriodEnd(asOf: string, period: AccrualPeriod): string {
  const ms = toUtcDate(asOf);
  const date = new Date(ms);
  if (period === 'day') return toIso(ms);
  if (period === 'week') {
    const isoWeekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    return toIso(ms + (7 - isoWeekday) * DAY_MS);
  }
  if (period === 'month') {
    return toIso(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  }
  return `${date.getUTCFullYear()}-12-31`;
}

/** Rounds to the 2 decimal places balances are stored with. */
export function roundLeaveDays(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
