import Decimal from 'decimal.js';

/** Split counted leave days across configured cumulative pay-tier limits. */
export function splitPayTiers(
  alreadyUsed: number,
  requested: number,
  tiers: ReadonlyArray<{ throughDays: number; payRate: number }>,
): Array<{ days: number; payRate: number }> {
  if (
    !Number.isFinite(alreadyUsed) ||
    alreadyUsed < 0 ||
    !Number.isFinite(requested) ||
    requested < 0
  ) {
    throw new Error('Leave days must be non-negative finite numbers');
  }
  let previousLimit = new Decimal(0);
  let position = new Decimal(alreadyUsed);
  let remaining = new Decimal(requested);
  const result: Array<{ days: number; payRate: number }> = [];
  for (const tier of tiers) {
    if (
      !Number.isFinite(tier.throughDays) ||
      !Number.isFinite(tier.payRate) ||
      tier.payRate < 0 ||
      tier.payRate > 1 ||
      new Decimal(tier.throughDays).lte(previousLimit)
    ) {
      throw new Error('Invalid pay tiers');
    }
    const limit = new Decimal(tier.throughDays);
    const portion = Decimal.min(
      remaining,
      Decimal.max(0, limit.minus(position)),
    );
    if (portion.gt(0)) {
      result.push({ days: portion.toNumber(), payRate: tier.payRate });
      position = position.plus(portion);
      remaining = remaining.minus(portion);
    }
    previousLimit = limit;
  }
  if (remaining.gt(0)) result.push({ days: remaining.toNumber(), payRate: 0 });
  return result;
}

/** Allocate consumption to the oldest credit first, without mutating inputs. */
export function allocateOldestCredits(
  credits: ReadonlyArray<{
    id: string;
    availableDays: number;
    earnedDate: string;
  }>,
  requested: number,
) {
  if (!Number.isFinite(requested) || requested < 0)
    throw new Error('Invalid requested days');
  const seen = new Set<string>();
  for (const credit of credits) {
    if (
      !credit.id ||
      seen.has(credit.id) ||
      !Number.isFinite(credit.availableDays) ||
      credit.availableDays < 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(credit.earnedDate)
    )
      throw new Error('Invalid credit');
    seen.add(credit.id);
  }
  let remaining = new Decimal(requested);
  const allocations: Array<{ id: string; days: number }> = [];
  for (const credit of [...credits].sort(
    (a, b) =>
      a.earnedDate.localeCompare(b.earnedDate) || a.id.localeCompare(b.id),
  )) {
    const consumed = Decimal.min(remaining, credit.availableDays);
    if (consumed.gt(0))
      allocations.push({ id: credit.id, days: consumed.toNumber() });
    remaining = remaining.minus(consumed);
    if (remaining.isZero()) break;
  }
  return { allocations, unallocatedDays: remaining.toNumber() };
}
