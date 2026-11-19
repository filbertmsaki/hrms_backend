/**
 * Statutory pay bands recorded on a leave request (leave_requests.pay_breakdown)
 * are ordered chronologically: the first `bands[0].days` leave days of the
 * request are paid at `bands[0].pay_percent`, and so on. A payroll period that
 * covers only part of the request must take the matching slice of that
 * sequence, so a request spanning two periods is paid exactly once overall.
 *
 * `offsetDays` is the number of the request's leave days that fall before the
 * period; `days` is the number that fall inside it. Days beyond the recorded
 * bands (should not happen, but e.g. a later duration edit) are treated as
 * unpaid, which is the conservative statutory reading ("unpaid beyond the
 * last stage").
 */
export function splitLeaveByPayBands(
  bands: ReadonlyArray<{ days: number; pay_percent: number }>,
  offsetDays: number,
  days: number,
): { paidEquivalentDays: number; unpaidEquivalentDays: number } {
  const total = Math.max(0, days);
  let skip = Math.max(0, offsetDays);
  let remaining = total;
  let paid = 0;
  for (const band of bands) {
    if (remaining <= 0) break;
    let bandDays = Math.max(0, Number(band.days) || 0);
    const skipped = Math.min(skip, bandDays);
    skip -= skipped;
    bandDays -= skipped;
    const used = Math.min(bandDays, remaining);
    const rate = Math.min(100, Math.max(0, Number(band.pay_percent) || 0));
    paid += (used * rate) / 100;
    remaining -= used;
  }
  const paidEquivalentDays = round4(paid);
  return {
    paidEquivalentDays,
    unpaidEquivalentDays: round4(total - paidEquivalentDays),
  };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
