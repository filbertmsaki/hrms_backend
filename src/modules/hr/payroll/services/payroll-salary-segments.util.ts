/**
 * Mid-period salary segmentation.
 *
 * A period can be covered by several compensation versions (an increment
 * effective on the 16th supersedes the earlier version, whose effective_to is
 * set to the 15th). Each version is paid only for the days it covers inside
 * the employment window, using the configured proration divisor, so there are
 * no overlapping or missing salary days.
 */

export type CompensationLike = {
  id: number;
  baseSalary: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type SalarySegment<T extends CompensationLike> = {
  compensation: T;
  start: string;
  end: string;
  days: number;
  /** Prorated numerator over `denominator` (FIXED_30 adjusts the last). */
  numerator: number;
  denominator: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : null;
}

export function daysBetweenInclusive(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / DAY_MS) + 1;
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function prorationDenominator(
  periodStart: string,
  periodEnd: string,
  method?: string | null,
) {
  return method === 'FIXED_30'
    ? 30
    : daysBetweenInclusive(periodStart, periodEnd);
}

/**
 * Builds non-overlapping salary segments for the period. When versions
 * overlap (data error or a SCHEDULED version without the predecessor being
 * closed), the later effective_from wins from its start date.
 */
export function buildSalarySegments<T extends CompensationLike>(args: {
  versions: T[];
  periodStart: string;
  periodEnd: string;
  hireDate?: string | null;
  exitDate?: string | null;
  method?: string | null;
}): SalarySegment<T>[] {
  const periodStart = iso(args.periodStart)!;
  const periodEnd = iso(args.periodEnd)!;
  const windowStart = [periodStart, iso(args.hireDate)]
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop()!;
  const windowEnd = [periodEnd, iso(args.exitDate)]
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  const denominator = prorationDenominator(periodStart, periodEnd, args.method);
  if (windowEnd < windowStart) return [];

  const ordered = [...args.versions].sort((a, b) =>
    iso(a.effectiveFrom)! === iso(b.effectiveFrom)!
      ? a.id - b.id
      : iso(a.effectiveFrom)! < iso(b.effectiveFrom)!
        ? -1
        : 1,
  );
  const segments: SalarySegment<T>[] = [];
  ordered.forEach((version, index) => {
    const next = ordered[index + 1];
    const ownEnd = iso(version.effectiveTo);
    const nextStart = next ? addDays(iso(next.effectiveFrom)!, -1) : null;
    const start = [windowStart, iso(version.effectiveFrom)!].sort().pop()!;
    const end = [windowEnd, ownEnd, nextStart]
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    const days = daysBetweenInclusive(start, end);
    if (days <= 0) return;
    segments.push({
      compensation: version,
      start,
      end,
      days,
      numerator: days,
      denominator,
    });
  });

  // FIXED_30: a fully covered 31-day month must still total 30/30, and a
  // fully covered February 30/30; partial months pay calendar days capped at
  // 30. The adjustment goes to the last segment so earlier ones stay exact.
  if (args.method === 'FIXED_30' && segments.length > 0) {
    const covered = segments.reduce((sum, item) => sum + item.days, 0);
    const fullyCovered =
      windowStart === periodStart &&
      windowEnd === periodEnd &&
      covered === daysBetweenInclusive(periodStart, periodEnd);
    const target = fullyCovered ? 30 : Math.min(30, covered);
    const before = segments
      .slice(0, -1)
      .reduce((sum, item) => sum + item.numerator, 0);
    const last = segments[segments.length - 1];
    last.numerator = Math.max(0, target - before);
  }
  return segments;
}

/**
 * Distributes unpaid-equivalent leave days onto salary segments by the
 * calendar overlap of each leave span, clipped to the segments (and so to the
 * employment window). Returns per-segment unpaid days.
 */
export function allocateUnpaidDaysToSegments<T extends CompensationLike>(
  segments: SalarySegment<T>[],
  spans: Array<{ start: string; end: string; unpaidEquivalentDays: number }>,
) {
  const allocation = segments.map(() => 0);
  for (const span of spans) {
    if (span.unpaidEquivalentDays <= 0) continue;
    const spanDays = daysBetweenInclusive(span.start, span.end);
    if (spanDays <= 0) continue;
    segments.forEach((segment, index) => {
      const start = span.start > segment.start ? span.start : segment.start;
      const end = span.end < segment.end ? span.end : segment.end;
      const overlap = daysBetweenInclusive(start, end);
      if (overlap > 0) {
        allocation[index] += (span.unpaidEquivalentDays * overlap) / spanDays;
      }
    });
  }
  return allocation;
}
