import type { LeavePolicyType } from '../entities/leave-policy-type.entity';
import type { LeavePolicy } from '../entities/leave-policy.entity';

/** Whether a policy version applies on `asOf` (ISO date). */
export function isPolicyEffectiveOn(
  policy: Pick<LeavePolicy, 'effective_from' | 'effective_to'> &
    Partial<Pick<LeavePolicy, 'lifecycle_status'>>,
  asOf: string,
): boolean {
  if (
    policy.lifecycle_status &&
    !['active', 'superseded'].includes(policy.lifecycle_status)
  ) {
    return false;
  }
  const from = policy.effective_from
    ? String(policy.effective_from).slice(0, 10)
    : null;
  const to = policy.effective_to
    ? String(policy.effective_to).slice(0, 10)
    : null;
  return (!from || from <= asOf) && (!to || to >= asOf);
}

/** The day before an ISO date. */
export function dayBefore(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Policy fields that define behaviour (compared and copied between versions). */
export const VERSIONED_POLICY_FIELDS = [
  'name',
  'description',
  'applicable_branch_id',
  'applicable_department_id',
  'applicable_position_id',
  'applicable_grade_id',
  'applicable_employment_type',
  'applicable_confirmation_status',
  'accrual_method',
  'accrual_rate',
  'max_consecutive_days',
  'min_service_months',
  'allow_during_probation',
  'allow_negative_balance',
  'weekly_off_treatment',
  'holiday_treatment',
  'allow_half_day',
  'allow_short_leave',
  'minimum_short_leave_minutes',
  'maximum_short_leave_minutes',
  'minimum_notice_days',
  'maximum_backdate_days',
  'cancellation_requires_approval',
  'cancellation_cutoff_days',
  'maximum_accumulation_days',
  'priority',
  'attendance_balance_deduction_enabled',
  'absent_day_deduction_days',
  'unpaid_leave_day_deduction_days',
  'half_day_deduction_days',
  'leave_year_type',
  'leave_year_start_month',
  'leave_year_start_day',
  'rollover_execution_mode',
] as const;

/** Per-leave-type fields compared and copied between versions. */
export const VERSIONED_POLICY_TYPE_FIELDS = [
  'annual_quota_days',
  'max_per_request_days',
  'requires_approval',
  'encashment_enabled',
  'maximum_encashment_days',
  'encashment_rate_divisor',
  'encashment_salary_basis',
  'minimum_balance_after_encashment',
  'encashment_requires_approval',
  'maximum_accumulation_days',
  'accrual_method',
  'accrual_start_basis',
  'accrual_timing',
  'accrual_prorate',
  'carry_forward_enabled',
  'carry_forward_method',
  'carry_forward_max_days',
  'carry_forward_percentage',
  'carry_forward_expiry_months',
  'carry_forward_expiry_date',
  'carry_forward_auto_expire',
  'carry_forward_consume_first',
  'lapse_enabled',
  'protected_minimum_days',
  'auto_encash_enabled',
  'auto_encash_method',
  'auto_encash_max_days',
  'auto_encash_percentage',
] as const;

export type PolicyFieldChange = {
  field: string;
  leave_type_id?: number;
  before: unknown;
  after: unknown;
};

function normalize(value: unknown): unknown {
  if (value === undefined || value === '') return null;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/**
 * Field-by-field differences between two policy versions, including leave
 * types added, removed or changed.
 */
export function comparePolicyVersions(
  before: Partial<LeavePolicy> & { leave_types?: Partial<LeavePolicyType>[] },
  after: Partial<LeavePolicy> & { leave_types?: Partial<LeavePolicyType>[] },
): PolicyFieldChange[] {
  const changes: PolicyFieldChange[] = [];
  const record = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    [a, b] as const;
  const [left, right] = record(
    before as Record<string, unknown>,
    after as Record<string, unknown>,
  );
  for (const field of VERSIONED_POLICY_FIELDS) {
    if (!same(left[field], right[field])) {
      changes.push({
        field,
        before: normalize(left[field]),
        after: normalize(right[field]),
      });
    }
  }
  const byType = (rows?: Partial<LeavePolicyType>[]) =>
    new Map((rows ?? []).map((row) => [Number(row.leave_type_id), row]));
  const oldTypes = byType(before.leave_types);
  const newTypes = byType(after.leave_types);
  for (const typeId of new Set([...oldTypes.keys(), ...newTypes.keys()])) {
    const oldRow = oldTypes.get(typeId) as Record<string, unknown> | undefined;
    const newRow = newTypes.get(typeId) as Record<string, unknown> | undefined;
    if (!oldRow || !newRow) {
      changes.push({
        field: oldRow ? 'leave_type_removed' : 'leave_type_added',
        leave_type_id: typeId,
        before: oldRow ? normalize(oldRow.annual_quota_days) : null,
        after: newRow ? normalize(newRow.annual_quota_days) : null,
      });
      continue;
    }
    for (const field of VERSIONED_POLICY_TYPE_FIELDS) {
      if (!same(oldRow[field], newRow[field])) {
        changes.push({
          field,
          leave_type_id: typeId,
          before: normalize(oldRow[field]),
          after: normalize(newRow[field]),
        });
      }
    }
  }
  return changes;
}
