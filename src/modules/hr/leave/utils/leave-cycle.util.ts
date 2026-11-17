const DAY_MS = 86_400_000;

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid ISO date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Invalid ISO date');
  }
  return date;
}

/** Add months from the original anchor, clamping to the end of the month. */
export function cycleAnniversary(anchor: string, months: number): string {
  const date = parseDate(anchor);
  if (!Number.isInteger(months)) throw new Error('Months must be an integer');
  const first = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return first.toISOString().slice(0, 10);
}

/** Detect an anniversary cycle; the optional anchor supports migrated employees. */
export function detectLeaveCycle(
  anchor: string,
  cycleLengthMonths: number,
  asOf: string,
) {
  const start = parseDate(anchor);
  const when = parseDate(asOf);
  if (!Number.isInteger(cycleLengthMonths) || cycleLengthMonths <= 0) {
    throw new Error('Cycle length must be a positive integer');
  }
  if (when < start) throw new Error('Date precedes the cycle anchor');
  const elapsedMonths =
    (when.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    when.getUTCMonth() -
    start.getUTCMonth();
  let index = Math.floor(elapsedMonths / cycleLengthMonths);
  if (cycleAnniversary(anchor, index * cycleLengthMonths) > asOf) index -= 1;
  const startDate = cycleAnniversary(anchor, index * cycleLengthMonths);
  const nextStart = cycleAnniversary(anchor, (index + 1) * cycleLengthMonths);
  const endDate = new Date(parseDate(nextStart).getTime() - DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { cycleNumber: index + 1, startDate, endDate };
}

/** Daily accrual uses elapsed days, capped at the full cycle entitlement. */
export function anniversaryDailyAccrual(
  entitlement: number,
  startDate: string,
  endDate: string,
  asOf: string,
): number {
  const start = parseDate(startDate).getTime();
  const end = parseDate(endDate).getTime();
  const at = parseDate(asOf).getTime();
  if (end < start || entitlement < 0 || !Number.isFinite(entitlement))
    throw new Error('Invalid accrual period or entitlement');
  const cycleDays = (end - start) / DAY_MS + 1;
  const elapsed = at >= end ? cycleDays : Math.max(0, (at - start) / DAY_MS);
  return Math.round(((entitlement * elapsed) / cycleDays) * 10000) / 10000;
}

export type LeaveCycleConfig = {
  leave_year_type?: 'calendar' | 'anniversary' | 'custom' | null;
  leave_year_start_month?: number | null;
  leave_year_start_day?: number | null;
};

export type LeaveCycle = {
  /** The year the cycle starts in; stored as leave_balances.fiscal_year. */
  label: string;
  startDate: string;
  endDate: string;
};

function isoOf(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
      ? value.toISOString().slice(0, 10)
      : null;
  }
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/** Month and day the leave year starts on for this config and employee. */
export function leaveCycleAnchor(
  config: LeaveCycleConfig | null | undefined,
  hireDate?: string | Date | null,
): { month: number; day: number } {
  const type = config?.leave_year_type ?? 'calendar';
  if (
    type === 'custom' &&
    config?.leave_year_start_month &&
    config?.leave_year_start_day
  ) {
    return {
      month: config.leave_year_start_month,
      day: config.leave_year_start_day,
    };
  }
  const hire = isoOf(hireDate);
  if (type === 'anniversary' && hire) {
    return { month: Number(hire.slice(5, 7)), day: Number(hire.slice(8, 10)) };
  }
  return { month: 1, day: 1 };
}

/** First day of the cycle that starts in `year`, clamped to month end (29 Feb). */
function cycleStartIn(year: number, anchor: { month: number; day: number }) {
  const lastDay = new Date(Date.UTC(year, anchor.month, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, anchor.month - 1, Math.min(anchor.day, lastDay)),
  )
    .toISOString()
    .slice(0, 10);
}

/** The leave cycle labelled `label` (the year it starts in). */
export function leaveCycleForLabel(
  config: LeaveCycleConfig | null | undefined,
  label: string | number,
  hireDate?: string | Date | null,
): LeaveCycle {
  const year = Number(label);
  if (!Number.isInteger(year)) throw new Error('Invalid leave year label');
  const anchor = leaveCycleAnchor(config, hireDate);
  const startDate = cycleStartIn(year, anchor);
  const nextStart = cycleStartIn(year + 1, anchor);
  const endDate = new Date(parseDate(nextStart).getTime() - DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { label: String(year), startDate, endDate };
}

/** The leave cycle containing `date`. */
export function leaveCycleForDate(
  config: LeaveCycleConfig | null | undefined,
  date: string,
  hireDate?: string | Date | null,
): LeaveCycle {
  const iso = isoOf(date);
  if (!iso) throw new Error('Invalid ISO date');
  const year = Number(iso.slice(0, 4));
  const anchor = leaveCycleAnchor(config, hireDate);
  return leaveCycleForLabel(
    config,
    iso < cycleStartIn(year, anchor) ? year - 1 : year,
    hireDate,
  );
}

/** True when the config runs a plain January–December leave year. */
export function isCalendarLeaveYear(
  config: LeaveCycleConfig | null | undefined,
  hireDate?: string | Date | null,
): boolean {
  const anchor = leaveCycleAnchor(config, hireDate);
  return anchor.month === 1 && anchor.day === 1;
}
