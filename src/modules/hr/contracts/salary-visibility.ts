import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';

/**
 * D4: salary is shown only to users with a payroll permission, and to the
 * employee for their own contract. Others see it masked; they can still send
 * the contract, and the PDF (which contains the salary) stays downloadable.
 */
export const SALARY_PERMISSIONS = [
  'payroll:profiles:read',
  'payroll:salary:approve',
] as const;

export const HIDDEN = null;

export function canSeeSalary(
  actor: AuthenticatedUser,
  ownerEmployeeId?: number | null,
): boolean {
  if (ownerEmployeeId && actor.employeeId === ownerEmployeeId) return true;
  return SALARY_PERMISSIONS.some((permission) =>
    hasPermission(actor.permissions, permission),
  );
}

/** Template fields that reveal the salary amount. */
const SALARY_TOKENS = ['salary'];
/** Particulars keys that hold salary text. */
const SALARY_PARTICULARS = ['remuneration'];

function maskMap(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const copy = { ...(value as Record<string, unknown>) };
  for (const key of SALARY_TOKENS) if (key in copy) copy[key] = HIDDEN;
  return copy;
}

/** Copy of particulars with every salary value removed. */
export function maskParticulars(particulars: unknown): unknown {
  if (!particulars || typeof particulars !== 'object') return particulars;
  const copy = { ...(particulars as Record<string, unknown>) };
  for (const key of SALARY_PARTICULARS) if (key in copy) copy[key] = HIDDEN;
  copy.field_overrides = maskMap(copy.field_overrides);
  if (copy.snapshot && typeof copy.snapshot === 'object') {
    const snapshot = { ...(copy.snapshot as Record<string, unknown>) };
    snapshot.values = maskMap(snapshot.values);
    snapshot.automatic = maskMap(snapshot.automatic);
    snapshot.overrides = maskMap(snapshot.overrides);
    copy.snapshot = snapshot;
  }
  return copy;
}

/** A contract row as returned to a user who may not see salary. */
export function maskContractRow<
  T extends { salaryAmount?: unknown; particulars?: unknown },
>(row: T): T & { salaryHidden: true } {
  return {
    ...row,
    salaryAmount: HIDDEN,
    particulars: maskParticulars(row.particulars),
    salaryHidden: true,
  } as T & { salaryHidden: true };
}

/** Audit old/new values: hide any salary-bearing key. */
export function maskAuditValues(
  values: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!values) return values;
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      /salary|remuneration/i.test(key) ? '(hidden)' : value,
    ]),
  );
}

/**
 * Users without salary access cannot change it: their saves keep the stored
 * value (salary fields in the request are ignored, not rejected, because the
 * editor shows them as hidden).
 */
export function stripSalaryChanges<T extends object>(dto: T): T {
  const copy = { ...dto } as Record<string, unknown>;
  delete copy.salary_amount;
  delete copy.remuneration;
  for (const key of ['field_overrides', 'override_reasons']) {
    const map = copy[key];
    if (map && typeof map === 'object') {
      const next = { ...(map as Record<string, unknown>) };
      for (const token of SALARY_TOKENS) delete next[token];
      copy[key] = next;
    }
  }
  return copy as T;
}
