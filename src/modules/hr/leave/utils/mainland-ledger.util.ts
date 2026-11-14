import type { LeaveLedgerEntry } from '../entities/leave-ledger-entry.entity';
import {
  Bucket,
  MainlandPolicy,
  bucketUsable,
  round4,
} from './mainland-leave-engine';

type Row = Pick<
  LeaveLedgerEntry,
  | 'entry_type'
  | 'dimension'
  | 'cycle_start'
  | 'source_cycle_start'
  | 'bucket_expires_on'
  | 'effective_date'
  | 'amount_days'
  | 'pay_rate'
  | 'leave_request_id'
  | 'metadata'
>;

const n = (v: string | number | null | undefined) => Number(v ?? 0);

/**
 * Bucket state from ledger rows effective on or before `asOf`.
 * Expiry: latest EXPIRY_EXTENDED metadata.new_expires_on, else the bucket's
 * own expiry. Status from FORFEITED / EXPIRY_FLAGGED / EXPIRY_EXTENDED rows.
 */
export function bucketsAsOf(rows: Row[], asOf: string): Bucket[] {
  const map = new Map<string, Bucket & { source: string }>();
  const get = (src: string) => {
    let b = map.get(src);
    if (!b) {
      b = { source: src, sourceCycle: 0, remaining: 0, expiresOn: null, status: 'active' };
      map.set(src, b);
    }
    return b;
  };
  const sorted = [...rows]
    .filter((r) => r.effective_date <= asOf)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  for (const r of sorted) {
    const b = get(r.source_cycle_start);
    if (r.dimension === 'balance') b.remaining = round4(b.remaining + n(r.amount_days));
    if (r.bucket_expires_on && (r.entry_type === 'CARRY_OVER_IN' || r.entry_type === 'OPENING_BALANCE')) b.expiresOn = r.bucket_expires_on;
    if (r.entry_type === 'EXPIRY_FLAGGED') b.status = 'flagged';
    if (r.entry_type === 'EXPIRY_EXTENDED') {
      b.status = 'extended';
      b.expiresOn = String(r.metadata?.new_expires_on ?? b.expiresOn);
    }
    if (r.entry_type === 'FORFEITED') b.status = 'forfeited';
  }
  const ordered = [...map.values()].sort((a, b) => a.source.localeCompare(b.source));
  return ordered.map((b, i) => ({ ...b, sourceCycle: i + 1 }));
}

export function sourceOf(buckets: Bucket[], sourceCycle: number): string {
  return (buckets[sourceCycle - 1] as Bucket & { source: string }).source;
}

/** Available credit usable on `date` (reservations included). */
export function usableCredit(policy: MainlandPolicy, rows: Row[], asOf: string, date: string) {
  const buckets = bucketsAsOf(rows, asOf);
  const reserved = reservationsBySource(rows);
  return round4(
    buckets
      .filter((b) => bucketUsable(policy, { ...b, remaining: b.remaining + (reserved.get(sourceOf(buckets, b.sourceCycle)) ?? 0) }, date))
      .reduce((s, b) => s + b.remaining + (reserved.get(sourceOf(buckets, b.sourceCycle)) ?? 0), 0),
  );
}

export function reservationsBySource(rows: Row[]) {
  const m = new Map<string, number>();
  for (const r of rows)
    if (r.dimension === 'reservation')
      m.set(r.source_cycle_start, round4((m.get(r.source_cycle_start) ?? 0) + n(r.amount_days)));
  return m;
}

/**
 * Summarise one family's ledger as of a date. Positive "taken"/"pending"
 * figures are days. Future-dated TAKEN entries are "scheduled".
 */
export function summarise(rows: Row[], cycleStart: string | null, asOf: string, pendingRequestIds: Set<number>) {
  let untieredTaken = 0;
  let accrued = 0, opening = 0, carried = 0, taken = 0, scheduled = 0, pending = 0,
    forfeited = 0, paidOut = 0, adjusted = 0, entitlement = 0, balance = 0;
  const tiers = new Map<number, number>();
  for (const r of rows) {
    const amt = n(r.amount_days);
    if (r.dimension === 'reservation') {
      if (r.leave_request_id && pendingRequestIds.has(r.leave_request_id)) pending -= amt;
      continue;
    }
    const inCycle = !cycleStart || r.cycle_start === cycleStart;
    if (r.effective_date > asOf) {
      if (r.entry_type === 'TAKEN' && inCycle) scheduled -= amt;
      continue;
    }
    balance += amt;
    if (!inCycle) continue;
    switch (r.entry_type) {
      case 'ACCRUAL':
      case 'TRUE_UP': accrued += amt; break;
      case 'ENTITLEMENT': entitlement += amt; break;
      case 'OPENING_BALANCE': {
        // Cutover components keep accrual/taken/carry comparable with live postings.
        const component = r.metadata?.component;
        opening += amt;
        if (component === 'accrual') accrued += amt;
        else if (component === 'taken') {
          taken -= amt;
          untieredTaken -= amt; // pre-cutover usage: no pay rate on the ledger
        }
        else if (component === 'carry') carried += amt;
        break;
      }
      case 'CARRY_OVER_IN': carried += amt; break;
      case 'TAKEN':
        taken -= amt;
        if (r.pay_rate != null) tiers.set(n(r.pay_rate), round4((tiers.get(n(r.pay_rate)) ?? 0) - amt));
        break;
      case 'REVERSAL':
        if (r.pay_rate != null) tiers.set(n(r.pay_rate), round4((tiers.get(n(r.pay_rate)) ?? 0) - amt));
        taken -= amt;
        break;
      case 'FORFEITED': forfeited -= amt; break;
      case 'PAYOUT': paidOut -= amt; break;
      case 'ADJUSTMENT': adjusted += amt; break;
      default: break;
    }
  }
  return {
    entitlement: round4(entitlement),
    opening: round4(opening),
    accrued: round4(accrued),
    carried: round4(carried),
    taken: round4(taken),
    scheduled: round4(scheduled),
    pending: round4(pending),
    forfeited: round4(forfeited),
    paid_out: round4(paidOut),
    adjusted: round4(adjusted),
    /** Posted balance on asOf (all buckets), before reservations. */
    balance: round4(balance),
    available: round4(balance - pending - scheduled),
    /** Opening (pre-cutover) taken days that carry no pay rate. */
    untiered_taken: round4(untieredTaken),
    tier_usage: [...tiers.entries()].map(([pay_rate, days]) => ({ pay_rate, days })).sort((a, b) => b.pay_rate - a.pay_rate),
  };
}
