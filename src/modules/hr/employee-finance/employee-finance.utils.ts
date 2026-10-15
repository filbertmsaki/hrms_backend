import { createHash } from 'crypto';
import { EmployeeFinanceAccountStatusEnum } from './employee-finance.enums';

export function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number, day = 28) {
  const source = new Date(`${date}T00:00:00.000Z`);
  const next = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString().slice(0, 10);
}

export function addDaysString(date: string, days: number) {
  const source = new Date(`${date}T00:00:00.000Z`);
  source.setUTCDate(source.getUTCDate() + days);
  return source.toISOString().slice(0, 10);
}

export function daysBetweenDates(from: string, to = todayString()) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

export function monthsBetween(from: string | null, to = new Date()) {
  if (!from) return 0;
  const start = new Date(`${from}T00:00:00.000Z`);
  return Math.max(
    0,
    (to.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - start.getUTCMonth()),
  );
}

export function activeAccountStatuses() {
  return [
    EmployeeFinanceAccountStatusEnum.ACTIVE,
    EmployeeFinanceAccountStatusEnum.DEFERRED,
    EmployeeFinanceAccountStatusEnum.IN_ARREARS,
    EmployeeFinanceAccountStatusEnum.RESTRUCTURED,
    EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT,
  ];
}

export function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** A JSON field as text: strings and numbers pass through, anything else is `fallback`. */
export function textValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

export function actorMembershipId(actor: {
  id: number;
  companyMembershipId?: number;
}) {
  return actor.companyMembershipId ?? actor.id;
}
