/**
 * Mainland Tanzania leave rules engine (pure, side-effect free).
 *
 * Every number comes from the effective policy config (see
 * config/mainland-policy-2027.draft.json). Services resolve the effective
 * profile/policy and ledger rows, then call these functions; nothing here
 * reads the database or posts transactions, so projections can never create
 * actual ledger entries.
 *
 * Day conventions: ISO `YYYY-MM-DD` dates, UTC arithmetic. Accrual "as of" a
 * date counts the days elapsed before that date (the as-of day itself is not
 * yet earned), so 2025-03-15 → 2025-09-15 is 184 days. Expiry dates are the
 * last usable day (inclusive). Amounts are kept to four decimals.
 */
import { cycleAnniversary, detectLeaveCycle } from './leave-cycle.util';

const DAY_MS = 86_400_000;

export type MainlandPolicy = {
  annual: {
    entitlement_days: number;
    cycle_length_months: number;
    accrual_method: 'daily' | 'monthly';
    carry_over_expiry_months: number;
    approved_extension_months: number;
    expiry_action: 'flag' | 'forfeit';
    advance_leave_enabled: boolean;
  };
  sick: {
    entitlement_days: number;
    cycle_length_months: number;
    pay_tiers: { through_days: number; pay_rate: number }[];
    beyond_tiers_pay_rate: number;
    medical_certificate_required: boolean;
  };
  maternity: {
    single_birth_days: number;
    multiple_birth_days: number;
    child_death_extra_days: number;
    child_death_window_months: number;
    maximum_paid_terms: number;
    notice_months: number;
    earliest_start_weeks_before_expected_birth: number;
    return_restriction_weeks_after_birth: number;
  };
  paternity: {
    entitlement_days: number;
    start_window_days_after_birth: number;
    company_benefit_enabled: boolean;
    company_benefit_days: number;
    company_benefit_start_window_days: number;
  };
  compassionate: {
    entitlement_days: number;
    retroactive_return_window_working_days: number;
    events: string[];
  };
  unpaid: {
    maximum_days_per_12_months: number;
    pause_annual_accrual: boolean;
    pause_for_blocks_longer_than_calendar_days: number;
  };
  early_service: {
    months: number;
    annual_days_per_completed_month: number;
    sick_paid_days_per_employment_spell: number;
    rehire_lookback_months: number;
  };
  part_time: { prorate_by_fte: boolean };
  termination: { monthly_wage_divisor: number };
  public_holiday_work: {
    pay_multiplier: number;
    fallback_monthly_hours: number;
  };
  unauthorized_absence: { flag_after_consecutive_working_days: number };
  carry_over_warning_days: number[];
};

export type EmployeeLeaveContext = {
  hireDate: string;
  /** Migrated anchor overrides the hire date for cycles only. */
  cycleAnchorDate?: string | null;
  fte: number;
  previousEmploymentPeriods?: { start_date: string; end_date: string }[];
  /** Approved unpaid leave blocks (inclusive dates). */
  unpaidBlocks?: { start: string; end: string }[];
  terminationDate?: string | null;
};

export type Cycle = { cycleNumber: number; startDate: string; endDate: string };

// ---------- date helpers ----------
export function toDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(`Invalid date ${value}`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (d.toISOString().slice(0, 10) !== value)
    throw new Error(`Invalid date ${value}`);
  return d;
}
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (value: string, days: number) =>
  iso(new Date(toDate(value).getTime() + days * DAY_MS));
/** Whole days from `a` to `b` (b − a). */
export const daysBetween = (a: string, b: string) =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
export const round4 = (n: number) => Math.round(n * 10000) / 10000;
export const round2 = (n: number) => Math.round(n * 100) / 100;

function* eachDay(start: string, end: string) {
  for (let d = start; d <= end; d = addDays(d, 1)) yield d;
}

/** Completed calendar months from anchor to asOf (anniversary-clamped). */
export function completedMonths(anchor: string, asOf: string): number {
  if (asOf < anchor) return 0;
  const a = toDate(anchor);
  const b = toDate(asOf);
  let m =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    b.getUTCMonth() -
    a.getUTCMonth();
  if (cycleAnniversary(anchor, m) > asOf) m -= 1;
  return Math.max(0, m);
}

// ---------- cycles ----------
export type CycleKind = 'annual' | 'sick' | 'compassionate';

export function cycleAnchor(ctx: EmployeeLeaveContext): string {
  return ctx.cycleAnchorDate ?? ctx.hireDate;
}

/** Returns null for dates before the anchor (no entitlement before hire). */
export function detectCycle(
  policy: MainlandPolicy,
  ctx: EmployeeLeaveContext,
  kind: CycleKind,
  asOf: string,
): Cycle | null {
  const anchor = cycleAnchor(ctx);
  if (asOf < anchor) return null;
  const months =
    kind === 'sick'
      ? policy.sick.cycle_length_months
      : policy.annual.cycle_length_months;
  return detectLeaveCycle(anchor, months, asOf);
}

// ---------- eligibility ----------
/** Prior company spell ending within the lookback before hire grants statutory eligibility. */
export function hasRehireException(
  policy: MainlandPolicy,
  ctx: EmployeeLeaveContext,
): boolean {
  const lookbackStart = cycleAnniversary(
    ctx.hireDate,
    -policy.early_service.rehire_lookback_months,
  );
  return (ctx.previousEmploymentPeriods ?? []).some(
    (p) => p.end_date >= lookbackStart && p.end_date < ctx.hireDate,
  );
}

export function isInEarlyService(
  policy: MainlandPolicy,
  ctx: EmployeeLeaveContext,
  asOf: string,
) {
  return completedMonths(ctx.hireDate, asOf) < policy.early_service.months;
}

// ---------- annual accrual ----------
function fteFactor(policy: MainlandPolicy, ctx: EmployeeLeaveContext) {
  return policy.part_time.prorate_by_fte ? ctx.fte : 1;
}

/** Calendar days inside [from, toExclusive) covered by unpaid blocks long enough to pause accrual. */
export function pausedDays(
  policy: MainlandPolicy,
  ctx: EmployeeLeaveContext,
  from: string,
  toExclusive: string,
): number {
  if (!policy.unpaid.pause_annual_accrual) return 0;
  let total = 0;
  for (const b of ctx.unpaidBlocks ?? []) {
    const length = daysBetween(b.start, b.end) + 1;
    if (length <= policy.unpaid.pause_for_blocks_longer_than_calendar_days)
      continue;
    const s = b.start > from ? b.start : from;
    const eExcl =
      addDays(b.end, 1) < toExclusive ? addDays(b.end, 1) : toExclusive;
    if (eExcl > s) total += daysBetween(s, eExcl);
  }
  return total;
}

/**
 * Annual days earned in the cycle containing asOf (before carry-over).
 * During early service returns the company benefit (1.5/completed month);
 * from six months onward returns normal anniversary accrual, which equals the
 * benefit plus the one-time true-up.
 */
export function annualAccrued(
  policy: MainlandPolicy,
  ctx: EmployeeLeaveContext,
  asOf: string,
): {
  cycle: Cycle | null;
  accrued: number;
  basis: 'early_service' | 'daily' | 'monthly';
} {
  // After termination, accrue through the last employed day, in its cycle.
  const terminated = !!ctx.terminationDate && asOf > ctx.terminationDate;
  const effective = terminated
    ? addDays(ctx.terminationDate as string, 1)
    : asOf;
  const cycle = detectCycle(
    policy,
    ctx,
    'annual',
    terminated ? (ctx.terminationDate as string) : asOf,
  );
  if (!cycle) return { cycle: null, accrued: 0, basis: 'daily' };
  const f = fteFactor(policy, ctx);
  if (
    cycle.cycleNumber === 1 &&
    isInEarlyService(policy, ctx, effective) &&
    !ctx.cycleAnchorDate
  ) {
    const m = completedMonths(ctx.hireDate, effective);
    return {
      cycle,
      accrued: round4(
        m * policy.early_service.annual_days_per_completed_month * f,
      ),
      basis: 'early_service',
    };
  }
  const ent = policy.annual.entitlement_days * f;
  const cycleDays = daysBetween(cycle.startDate, cycle.endDate) + 1;
  const accrueTo =
    effective > cycle.endDate ? addDays(cycle.endDate, 1) : effective;
  if (policy.annual.accrual_method === 'monthly') {
    const months = Math.min(
      policy.annual.cycle_length_months,
      completedMonths(cycle.startDate, accrueTo),
    );
    const pausedMonths =
      pausedDays(policy, ctx, cycle.startDate, accrueTo) / (cycleDays / 12);
    return {
      cycle,
      accrued: round4(
        Math.max(0, months - pausedMonths) *
          (ent / policy.annual.cycle_length_months),
      ),
      basis: 'monthly',
    };
  }
  const elapsed =
    daysBetween(cycle.startDate, accrueTo) -
    pausedDays(policy, ctx, cycle.startDate, accrueTo);
  return {
    cycle,
    accrued: round4((ent * Math.max(0, elapsed)) / cycleDays),
    basis: 'daily',
  };
}

/** The one idempotent adjustment posted at six months: normal accrual minus benefit posted so far. */
export function earlyServiceTrueUp(
  policy: MainlandPolicy,
  ctx: EmployeeLeaveContext,
  benefitPosted: number,
): { date: string; amount: number; idempotencyKey: string } {
  const date = cycleAnniversary(ctx.hireDate, policy.early_service.months);
  const normal = annualAccrued(policy, ctx, date).accrued;
  return {
    date,
    amount: round4(normal - benefitPosted),
    idempotencyKey: `annual-trueup:${ctx.hireDate}`,
  };
}

// ---------- carry-over buckets ----------
export type Bucket = {
  sourceCycle: number;
  /** Days remaining in the bucket. */
  remaining: number;
  /** Last usable day, inclusive. null for the current cycle's accrual. */
  expiresOn: string | null;
  status: 'active' | 'flagged' | 'extended' | 'forfeited';
};

export function carryOverExpiry(
  policy: MainlandPolicy,
  nextCycleStart: string,
  extended = false,
): string {
  const months = extended
    ? policy.annual.approved_extension_months
    : policy.annual.carry_over_expiry_months;
  return addDays(cycleAnniversary(nextCycleStart, months), -1);
}

/** Usable on `date`: forfeited never; after expiry only when expiry action is flag (flagged stays usable). */
export function bucketUsable(
  policy: MainlandPolicy,
  b: Bucket,
  date: string,
): boolean {
  if (b.status === 'forfeited' || b.remaining <= 0) return false;
  if (!b.expiresOn || date <= b.expiresOn) return true;
  // Flag-only expiry: days stay usable and payable until HR forfeits or extends.
  return policy.annual.expiry_action === 'flag';
}

/** Oldest-first consumption. Returns per-bucket draws and any shortfall. */
export function consumeOldestFirst(
  policy: MainlandPolicy,
  buckets: Bucket[],
  days: number,
  date: string,
): {
  draws: { sourceCycle: number; days: number }[];
  shortfall: number;
  buckets: Bucket[];
} {
  const next = buckets.map((b) => ({ ...b }));
  const ordered = [...next].sort((a, b) => a.sourceCycle - b.sourceCycle);
  const draws: { sourceCycle: number; days: number }[] = [];
  let left = days;
  for (const b of ordered) {
    if (left <= 0) break;
    if (!bucketUsable(policy, b, date)) continue;
    const take = Math.min(b.remaining, left);
    b.remaining = round4(b.remaining - take);
    left = round4(left - take);
    draws.push({ sourceCycle: b.sourceCycle, days: take });
  }
  return { draws, shortfall: left, buckets: next };
}

/** Expiry warnings due today (deduplicate on bucket+threshold). */
export function expiryWarningsDue(
  policy: MainlandPolicy,
  buckets: Bucket[],
  today: string,
) {
  return buckets.flatMap((b) =>
    b.expiresOn && b.remaining > 0 && b.status !== 'forfeited'
      ? policy.carry_over_warning_days
          .filter((d) => daysBetween(today, b.expiresOn as string) === d)
          .map((d) => ({
            sourceCycle: b.sourceCycle,
            expiresOn: b.expiresOn as string,
            daysBefore: d,
            dedupeKey: `carry-warn:${b.sourceCycle}:${b.expiresOn}:${d}`,
          }))
      : [],
  );
}

/** Daily expiry processing: past-expiry active buckets become flagged (or forfeited if configured). */
export function processExpiry(
  policy: MainlandPolicy,
  buckets: Bucket[],
  today: string,
) {
  return buckets.map((b) =>
    b.status === 'active' &&
    b.expiresOn &&
    today > b.expiresOn &&
    b.remaining > 0
      ? {
          ...b,
          status:
            policy.annual.expiry_action === 'forfeit'
              ? ('forfeited' as const)
              : ('flagged' as const),
        }
      : b,
  );
}

// ---------- day counting ----------
export type DayCalendar = {
  isRestDay: (date: string) => boolean;
  isPublicHoliday: (date: string) => boolean;
  isWorkersCompensation?: (date: string) => boolean;
};

export function countDays(
  start: string,
  end: string,
  basis: 'calendar_days' | 'working_days',
  cal: DayCalendar,
  opts: {
    excludeWorkersComp?: boolean;
    halfDayStart?: boolean;
    halfDayEnd?: boolean;
  } = {},
): {
  counted: string[];
  excluded: { date: string; reason: string }[];
  units: number;
} {
  const counted: string[] = [];
  const excluded: { date: string; reason: string }[] = [];
  for (const d of eachDay(start, end)) {
    if (basis === 'working_days') {
      if (cal.isRestDay(d)) {
        excluded.push({ date: d, reason: 'rest_day' });
        continue;
      }
      if (cal.isPublicHoliday(d)) {
        excluded.push({ date: d, reason: 'public_holiday' });
        continue;
      }
      if (opts.excludeWorkersComp && cal.isWorkersCompensation?.(d)) {
        excluded.push({ date: d, reason: 'workers_compensation' });
        continue;
      }
    }
    counted.push(d);
  }
  let units = counted.length;
  if (opts.halfDayStart && counted[0] === start) units -= 0.5;
  if (opts.halfDayEnd && counted[counted.length - 1] === end && start !== end)
    units -= 0.5;
  return { counted, excluded, units };
}

// ---------- sick ----------
export function splitSickTiers(
  policy: MainlandPolicy,
  usedInCycle: number,
  requested: number,
  opts: { earlyServicePaidCap?: number | null; paidUsedInSpell?: number } = {},
) {
  const tiers = [...policy.sick.pay_tiers].sort(
    (a, b) => a.through_days - b.through_days,
  );
  const out: { payRate: number; days: number }[] = [];
  let pos = usedInCycle;
  let left = requested;
  let lower = 0;
  for (const t of tiers) {
    if (left <= 0) break;
    const room = Math.max(0, t.through_days - Math.max(pos, lower));
    const take = Math.min(room, left);
    if (take > 0) {
      out.push({ payRate: t.pay_rate, days: take });
      pos += take;
      left -= take;
    }
    lower = t.through_days;
  }
  if (left > 0)
    out.push({ payRate: policy.sick.beyond_tiers_pay_rate, days: left });
  // Early-service cap: paid days beyond cap convert to unpaid.
  if (opts.earlyServicePaidCap != null) {
    let paidRoom = Math.max(
      0,
      opts.earlyServicePaidCap - (opts.paidUsedInSpell ?? 0),
    );
    for (const seg of out) {
      if (seg.payRate === 0) continue;
      const keep = Math.min(seg.days, paidRoom);
      paidRoom -= keep;
      const excess = seg.days - keep;
      seg.days = keep;
      if (excess > 0) out.push({ payRate: 0, days: excess });
    }
  }
  const merged = new Map<number, number>();
  for (const s of out)
    if (s.days > 0)
      merged.set(s.payRate, round4((merged.get(s.payRate) ?? 0) + s.days));
  const segments = [...merged.entries()]
    .map(([payRate, days]) => ({ payRate, days }))
    .sort((a, b) => b.payRate - a.payRate);
  return {
    segments,
    incapacityFlag: usedInCycle + requested > policy.sick.entitlement_days,
  };
}

export function sickEarlyServiceCap(
  policy: MainlandPolicy,
  ctx: EmployeeLeaveContext,
  asOf: string,
) {
  if (!isInEarlyService(policy, ctx, asOf) || hasRehireException(policy, ctx))
    return null;
  return round4(
    policy.early_service.sick_paid_days_per_employment_spell *
      fteFactor(policy, ctx),
  );
}

// ---------- validation results ----------
export type Finding = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
};
const err = (code: string, message: string): Finding => ({
  code,
  severity: 'error',
  message,
});
const warn = (code: string, message: string): Finding => ({
  code,
  severity: 'warning',
  message,
});

// ---------- annual booking ----------
export function validateAnnualBooking(
  policy: MainlandPolicy,
  ctx: EmployeeLeaveContext,
  input: {
    lastDay: string;
    requestedDays: number;
    carryOverUsable: number;
    takenInCycle: number;
    pendingAndFutureApproved: number;
    advanceApprovedByHr?: boolean;
  },
): { available: number; findings: Finding[] } {
  const projected = annualAccrued(
    policy,
    ctx,
    addDays(input.lastDay, 1),
  ).accrued;
  const available = round4(
    input.carryOverUsable +
      projected -
      input.takenInCycle -
      input.pendingAndFutureApproved,
  );
  const findings: Finding[] = [];
  if (input.requestedDays > available) {
    if (policy.annual.advance_leave_enabled && input.advanceApprovedByHr)
      findings.push(warn('ANNUAL_ADVANCE', 'Advance leave approved by HR'));
    else if (policy.annual.advance_leave_enabled)
      findings.push(
        err(
          'ANNUAL_ADVANCE_NEEDS_HR',
          'Request exceeds projected accrual; HR approval of advance leave required',
        ),
      );
    else
      findings.push(
        err(
          'ANNUAL_INSUFFICIENT',
          `Only ${round2(available)} days available by ${input.lastDay}`,
        ),
      );
  }
  return { available, findings };
}

// ---------- maternity ----------
export function validateMaternity(
  policy: MainlandPolicy,
  input: {
    start: string;
    expectedBirthDate: string;
    multipleBirth: boolean;
    paidTermsUsedAllSpells: number;
    submittedOn: string;
    earlyStartCertificate?: boolean;
    nssfReference?: string | null;
  },
) {
  const m = policy.maternity;
  const findings: Finding[] = [];
  const entitlement = input.multipleBirth
    ? m.multiple_birth_days
    : m.single_birth_days;
  const paid = input.paidTermsUsedAllSpells < m.maximum_paid_terms;
  if (!paid)
    findings.push(
      err(
        'MATERNITY_TERM_LIMIT',
        `Maximum of ${m.maximum_paid_terms} paid maternity terms reached; apply for unpaid or certified sick leave (HR notified)`,
      ),
    );
  if (
    addDays(input.submittedOn, 0) >
    addDays(cycleAnniversary(input.expectedBirthDate, -m.notice_months), 0)
  )
    findings.push(
      warn(
        'MATERNITY_SHORT_NOTICE',
        `Less than ${m.notice_months} months' notice`,
      ),
    );
  const earliest = addDays(
    input.expectedBirthDate,
    -7 * m.earliest_start_weeks_before_expected_birth,
  );
  if (input.start < earliest && !input.earlyStartCertificate)
    findings.push(
      err(
        'MATERNITY_EARLY_START',
        `Start before ${earliest} requires a medical certificate`,
      ),
    );
  if (!input.nssfReference)
    findings.push(
      warn('MATERNITY_NSSF_REFERENCE', 'Record the NSSF benefit reference'),
    );
  return {
    entitlementDays: entitlement,
    paid,
    endDate: addDays(input.start, entitlement - 1),
    findings,
  };
}

export function maternityChildDeathExtension(
  policy: MainlandPolicy,
  input: { birthDate: string; deathDate: string; termEndDate: string },
) {
  const m = policy.maternity;
  const windowEnd = addDays(
    cycleAnniversary(input.birthDate, m.child_death_window_months),
    -1,
  );
  if (input.deathDate < input.birthDate || input.deathDate > windowEnd)
    return {
      extraDays: 0,
      findings: [
        err(
          'MATERNITY_CHILD_DEATH_WINDOW',
          'Child death is outside the qualifying window',
        ),
      ],
    };
  return { extraDays: m.child_death_extra_days, findings: [] as Finding[] };
}

/** Clock-in / present marking within the post-birth restriction. */
export function returnToWorkAllowed(
  policy: MainlandPolicy,
  input: {
    birthDate: string;
    date: string;
    fitnessCertificate?: boolean;
    hrOverrideReason?: string | null;
  },
) {
  const restrictedUntil = addDays(
    input.birthDate,
    7 * policy.maternity.return_restriction_weeks_after_birth - 1,
  );
  if (input.date > restrictedUntil || input.date < input.birthDate)
    return { allowed: true, restrictedUntil };
  if (input.fitnessCertificate)
    return {
      allowed: true,
      restrictedUntil,
      viaOverride: !!input.hrOverrideReason,
    };
  return { allowed: false, restrictedUntil };
}

// ---------- paternity ----------
export function validatePaternity(
  policy: MainlandPolicy,
  input: { birthDate: string; start: string },
) {
  const p = policy.paternity;
  const window = p.company_benefit_enabled
    ? p.company_benefit_start_window_days
    : p.start_window_days_after_birth;
  const offset = daysBetween(input.birthDate, input.start);
  const findings: Finding[] = [];
  if (offset < 0 || offset > window)
    findings.push(
      err(
        'PATERNITY_START_WINDOW',
        `Paternity leave must start within ${window} days after birth`,
      ),
    );
  return {
    entitlementDays: p.company_benefit_enabled
      ? p.company_benefit_days
      : p.entitlement_days,
    findings,
  };
}

// ---------- compassionate ----------
export function validateCompassionate(
  policy: MainlandPolicy,
  cal: DayCalendar,
  input: {
    event: string;
    usedInCycle: number;
    requestedDays: number;
    returnDate?: string | null;
    submittedOn: string;
  },
) {
  const c = policy.compassionate;
  const findings: Finding[] = [];
  if (!c.events.includes(input.event))
    findings.push(
      err(
        'COMPASSIONATE_EVENT',
        'Event is not eligible for compassionate leave',
      ),
    );
  if (input.usedInCycle + input.requestedDays > c.entitlement_days)
    findings.push(
      err(
        'COMPASSIONATE_LIMIT',
        `Only ${c.entitlement_days - input.usedInCycle} compassionate days remain this cycle`,
      ),
    );
  if (input.returnDate && input.submittedOn > input.returnDate) {
    let d = input.returnDate;
    let n = 0;
    while (n < c.retroactive_return_window_working_days) {
      d = addDays(d, 1);
      if (!cal.isRestDay(d) && !cal.isPublicHoliday(d)) n += 1;
    }
    if (input.submittedOn > d)
      findings.push(
        err(
          'COMPASSIONATE_LATE',
          `Retrospective application deadline was ${d}`,
        ),
      );
  }
  return { findings };
}

// ---------- unpaid ----------
export function validateUnpaid(
  policy: MainlandPolicy,
  input: { usedInRolling12Months: number; requestedDays: number },
) {
  const max = policy.unpaid.maximum_days_per_12_months;
  return {
    findings:
      input.usedInRolling12Months + input.requestedDays > max
        ? [
            err(
              'UNPAID_LIMIT',
              `Unpaid leave limited to ${max} working days per 12 months`,
            ),
          ]
        : [],
  };
}

// ---------- money ----------
export function terminationSettlement(
  policy: MainlandPolicy,
  input: {
    accruedUntaken: number;
    eligibleCarryOver: number;
    monthlyBasicWage: number;
  },
) {
  const days = round4(input.accruedUntaken + input.eligibleCarryOver);
  const dailyRate =
    input.monthlyBasicWage / policy.termination.monthly_wage_divisor;
  if (days >= 0)
    return {
      payoutDays: days,
      payoutAmount: round2(days * dailyRate),
      recoveryDraft: null,
    };
  return {
    payoutDays: 0,
    payoutAmount: 0,
    recoveryDraft: {
      days: -days,
      amount: round2(-days * dailyRate),
      status: 'draft' as const,
    },
  };
}

export function holidayWorkPay(
  policy: MainlandPolicy,
  input: {
    hoursWorked: number;
    monthlyBasicWage: number;
    scheduledMonthlyHours?: number | null;
  },
) {
  const hours =
    input.scheduledMonthlyHours && input.scheduledMonthlyHours > 0
      ? input.scheduledMonthlyHours
      : policy.public_holiday_work.fallback_monthly_hours;
  const hourly = input.monthlyBasicWage / hours;
  return {
    hourlyRate: round4(hourly),
    amount: round2(
      input.hoursWorked * hourly * policy.public_holiday_work.pay_multiplier,
    ),
  };
}

// ---------- unauthorized absence ----------
export function unauthorizedAbsenceRuns(
  policy: MainlandPolicy,
  cal: DayCalendar,
  start: string,
  end: string,
  isCovered: (date: string) => boolean,
) {
  const runs: {
    start: string;
    end: string;
    workingDays: number;
    flagHr: boolean;
  }[] = [];
  type Run = { start: string; end: string; workingDays: number };
  let cur = null as Run | null;
  for (const d of eachDay(start, end)) {
    if (cal.isRestDay(d) || cal.isPublicHoliday(d)) continue;
    if (!isCovered(d)) {
      cur = cur
        ? { ...cur, end: d, workingDays: cur.workingDays + 1 }
        : { start: d, end: d, workingDays: 1 };
    } else if (cur) {
      runs.push({
        ...cur,
        flagHr:
          cur.workingDays >
          policy.unauthorized_absence.flag_after_consecutive_working_days,
      });
      cur = null;
    }
  }
  const last = cur;
  if (last)
    runs.push({
      ...last,
      flagHr:
        last.workingDays >
        policy.unauthorized_absence.flag_after_consecutive_working_days,
    });
  return runs;
}
