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
