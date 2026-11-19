/**
 * Single source of truth for "how many leave days of a request fall in a
 * date window" (a payroll period, a month). Used by payroll, the monthly
 * leave-to-payroll reconciliation and the historical allocation backfill.
 */
export interface AllocatableLeave {
  start_date: string;
  end_date: string;
  total_days: number | string;
  requested_minutes?: number | null;
  duration_type?: string | null;
  calculation_snapshot?: Record<string, unknown> | null;
}

export function hasIncludedDates(leave: AllocatableLeave): boolean {
  return Array.isArray(
    (leave.calculation_snapshot as { included_dates?: unknown } | null)
      ?.included_dates,
  );
}

export function leaveDaysInWindow(
  leave: AllocatableLeave,
  start: string,
  end: string,
): number {
  const snapshot = leave.calculation_snapshot as {
    included_dates?: unknown;
    duration_type?: string;
    working_day_minutes?: number;
  } | null;
  const totalDays = Number(leave.total_days);
  if (Array.isArray(snapshot?.included_dates)) {
    const included = snapshot.included_dates.filter(
      (date): date is string =>
        typeof date === 'string' && date >= start && date <= end,
    );
    if (included.length === 0) return 0;
    const durationType = snapshot.duration_type ?? leave.duration_type;
    if (durationType === 'HALF_DAY') return 0.5;
    if (durationType === 'SHORT_LEAVE') {
      const minutes = Number(leave.requested_minutes);
      const workingMinutes = Number(snapshot.working_day_minutes) || 480;
      return minutes > 0 ? Math.min(minutes / workingMinutes, totalDays) : 0;
    }
    return Math.min(included.length, totalDays);
  }
  // Legacy requests have no date-level snapshot to safely prorate around
  // excluded weekends and holidays. Keep their total in the start-date period.
  const startDate = String(leave.start_date).slice(0, 10);
  return startDate >= start && startDate <= end ? totalDays : 0;
}

export function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const end = Date.parse(`${endDate.slice(0, 10)}T00:00:00Z`);
  for (
    let t = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
    t <= end;
    t += 86_400_000
  ) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

export type IncludedDatesDerivation =
  | { ok: true; includedDates: string[]; method: string }
  | { ok: false; reason: string };

/**
 * Reconstruct the leave dates of a legacy request conservatively. A
 * candidate rule is accepted only when it reproduces the recorded
 * total_days exactly; otherwise the request needs manual review. Recorded
 * total_days is never changed.
 */
export function deriveIncludedDates(
  leave: AllocatableLeave,
  holidayDates: ReadonlySet<string>,
): IncludedDatesDerivation {
  const start = String(leave.start_date).slice(0, 10);
  const end = String(leave.end_date).slice(0, 10);
  const total = Number(leave.total_days);
  if (!(total > 0)) return { ok: false, reason: 'total_days is not positive' };
  if (end < start) return { ok: false, reason: 'end_date before start_date' };
  const durationType = leave.duration_type ?? 'FULL_DAY';
  if (durationType === 'HALF_DAY' || durationType === 'SHORT_LEAVE') {
    if (start !== end) {
      return { ok: false, reason: `${durationType} spans several dates` };
    }
    return { ok: true, includedDates: [start], method: 'single_day' };
  }
  const all = dateRange(start, end);
  const isWeekend = (d: string) => {
    const day = new Date(`${d}T00:00:00Z`).getUTCDay();
    return day === 0 || day === 6;
  };
  const candidates: Array<[string, string[]]> = [
    ['calendar_days', all],
    ['exclude_weekends', all.filter((d) => !isWeekend(d))],
    [
      'exclude_weekends_and_holidays',
      all.filter((d) => !isWeekend(d) && !holidayDates.has(d)),
    ],
    [
      'exclude_sundays',
      all.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0),
    ],
    [
      'exclude_sundays_and_holidays',
      all.filter(
        (d) =>
          new Date(`${d}T00:00:00Z`).getUTCDay() !== 0 && !holidayDates.has(d),
      ),
    ],
  ];
  const matches = candidates.filter(([, dates]) => dates.length === total);
  if (matches.length === 0) {
    return {
      ok: false,
      reason: `no date rule reproduces total_days=${total} (calendar ${all.length})`,
    };
  }
  // If two rules match with different dates the history is ambiguous.
  const distinct = new Set(matches.map(([, d]) => d.join(',')));
  if (distinct.size > 1) {
    return {
      ok: false,
      reason: `ambiguous: ${matches.map(([m]) => m).join(', ')} all give ${total} day(s) on different dates`,
    };
  }
  return { ok: true, includedDates: matches[0][1], method: matches[0][0] };
}

/** Days per calendar month (YYYY-MM) for a request. */
export function allocateByMonth(
  leave: AllocatableLeave,
): Record<string, number> {
  const result: Record<string, number> = {};
  const start = String(leave.start_date).slice(0, 7);
  const end = String(leave.end_date).slice(0, 7);
  let [y, m] = start.split('-').map(Number);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const days = leaveDaysInWindow(leave, `${key}-01`, last);
    if (days) result[key] = days;
    if (key >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return result;
}
