import { createHash } from 'crypto';

/**
 * "Live" drafts (created by the redesigned contract editor) do not store
 * copies of HR data. While the contract is a DRAFT, job, place, pay, hours,
 * probation and leave are resolved from the employee's current records; HR
 * can override a value only with a reason. Everything is frozen into
 * `particulars.snapshot` when the contract is sent.
 *
 * Drafts without `particulars.mode === 'live'` keep the original behaviour
 * (values copied into columns at creation), so existing contracts are
 * unchanged.
 */
export const LIVE_MODE = 'live';

export const REF_KEYS = [
  'department_id',
  'position_id',
  'grade_id',
  'branch_id',
  'reports_to_id',
] as const;
export type ContractRefKey = (typeof REF_KEYS)[number];
export type ContractRefs = Partial<Record<ContractRefKey, number>>;

/** Template field each reference fills; override reasons are keyed by it. */
export const REF_TOKEN: Record<ContractRefKey, string> = {
  department_id: 'department',
  position_id: 'job_title',
  grade_id: 'grade',
  branch_id: 'work_location',
  reports_to_id: 'reporting_manager',
};

/** Particulars keys that carry over between saves of the same contract. */
export const PERSISTENT_PARTICULAR_KEYS = [
  'mode',
  'refs',
  'override_reasons',
  'part_time',
  'snapshot',
  'snapshot_sha256',
  'certificate',
  'certificate_sha256',
] as const;

/** Keys that belong to one contract version and must not be copied to a new draft. */
export const VERSION_BOUND_PARTICULAR_KEYS = [
  'snapshot',
  'snapshot_sha256',
  'certificate',
  'certificate_sha256',
] as const;

export function isLiveMode(particulars: unknown): boolean {
  return (
    !!particulars &&
    typeof particulars === 'object' &&
    (particulars as Record<string, unknown>).mode === LIVE_MODE
  );
}

export function readRefs(particulars: unknown): ContractRefs {
  const raw =
    particulars && typeof particulars === 'object'
      ? (particulars as Record<string, unknown>).refs
      : null;
  const refs: ContractRefs = {};
  if (!raw || typeof raw !== 'object') return refs;
  for (const key of REF_KEYS) {
    const value = Number((raw as Record<string, unknown>)[key]);
    if (Number.isInteger(value) && value > 0) refs[key] = value;
  }
  return refs;
}

export function readStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim() !== '',
    ),
  );
}

/**
 * D3: a policy period that is a whole number of 30-day months becomes months;
 * anything else is never rounded. HR must choose a value (an override with a
 * reason).
 */
export function probationFromPolicyDays(days: number | null | undefined): {
  months: number | null;
  warning: string | null;
} {
  if (days === null || days === undefined || !Number.isFinite(days))
    return { months: null, warning: null };
  if (days === 0) return { months: 0, warning: null };
  if (days > 0 && days % 30 === 0) return { months: days / 30, warning: null };
  return {
    months: null,
    warning: `The probation policy sets ${days} days, which is not a whole number of months. Choose the probation period for this contract and give a reason.`,
  };
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function hhmm(value: string | null | undefined): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

/**
 * Describes a weekly timetable, grouping consecutive days with the same hours:
 * "08:00–17:00, Mon–Fri; 08:00–13:00, Sat". Day numbers follow JS getUTCDay
 * (0 = Sunday), as the attendance module does.
 */
export function describeWorkingTime(
  days: Array<{
    dayOfWeek: number;
    isWorkingDay: boolean;
    start: string | null;
    end: string | null;
  }>,
): string | null {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const byDay = new Map(days.map((day) => [day.dayOfWeek, day]));
  const groups: Array<{ hours: string; days: number[] }> = [];
  for (const dow of order) {
    const day = byDay.get(dow);
    const start = hhmm(day?.start);
    const end = hhmm(day?.end);
    if (!day?.isWorkingDay || !start || !end) continue;
    const hours = `${start}–${end}`;
    const last = groups[groups.length - 1];
    const previousDow = last?.days[last.days.length - 1];
    const consecutive =
      previousDow !== undefined &&
      order.indexOf(dow) === order.indexOf(previousDow) + 1;
    if (last && last.hours === hours && consecutive) last.days.push(dow);
    else groups.push({ hours, days: [dow] });
  }
  if (!groups.length) return null;
  return groups
    .map(({ hours, days: group }) => {
      const first = DAY_SHORT[group[0]];
      const lastDay = DAY_SHORT[group[group.length - 1]];
      return `${hours}, ${group.length > 1 ? `${first}–${lastDay}` : first}`;
    })
    .join('; ');
}

export function ageOn(
  dateOfBirth: string | null | undefined,
  onDate: string,
): number | null {
  if (!dateOfBirth) return null;
  const [by, bm, bd] = dateOfBirth.slice(0, 10).split('-').map(Number);
  const [y, m, d] = onDate.slice(0, 10).split('-').map(Number);
  if (!by || !y) return null;
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function humanizeCode(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  if (!text) return '';
  const words = text.replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Deterministic JSON (sorted keys) so a hash of frozen data is reproducible. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value))
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/**
 * Field-level differences between two flat records, for the audit log.
 * Values are compared by their JSON form.
 */
export function diffRecords(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): {
  changed: string[];
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
} {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed: string[] = [];
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const key of keys.sort()) {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (stableStringify(a) === stableStringify(b)) continue;
    changed.push(key);
    oldValues[key] = a;
    newValues[key] = b;
  }
  return { changed, oldValues, newValues };
}
