import Decimal from 'decimal.js';
import { createHash } from 'crypto';
import type { LeaveBalance } from '../entities/leave-balance.entity';

/**
 * A review aid based on the current legacy cache, not a historical balance.
 * Reservations are reported separately: they are not leave already taken.
 */
export function previewLegacyOpeningBalance(balance: LeaveBalance) {
  const issues: string[] = ['not_an_as_of_balance', 'requires_hr_review'];
  const value = (field: keyof LeaveBalance): Decimal => {
    const raw = balance[field];
    if (raw === null || raw === undefined || raw === '') {
      issues.push(`missing_${String(field)}`);
      return new Decimal(0);
    }
    try {
      if (typeof raw !== 'string' && typeof raw !== 'number') {
        throw new Error('Invalid value');
      }
      const parsed = new Decimal(raw);
      if (!parsed.isFinite()) throw new Error('Non-finite value');
      return parsed;
    } catch {
      issues.push(`invalid_${String(field)}`);
      return new Decimal(0);
    }
  };
  const opening = value('opening_balance_days');
  const carried = value('carried_forward_days');
  const accrued = value('accrued_days');
  const entitlement = value('entitlement_days');
  const allocated = value('allocated_days');
  if (opening.isZero() && carried.gt(0)) issues.push('legacy_opening_fallback');
  if (accrued.isZero() && (entitlement.gt(0) || allocated.gt(0))) {
    issues.push('zero_accrual_requires_review');
  }
  const adjustments = value('adjusted_days');
  const used = value('used_days');
  const expired = value('expired_days');
  const attendance = value('attendance_deduction_days');
  const pending = value('pending_days');
  const scheduled = value('approved_future_days');
  const candidate = opening
    .plus(accrued)
    .plus(adjustments)
    .minus(used)
    .minus(expired)
    .minus(attendance);
  return {
    can_post: false,
    candidate_days: candidate.toFixed(4),
    pending_days: pending.toFixed(4),
    scheduled_days: scheduled.toFixed(4),
    components: {
      opening_days: opening.toFixed(4),
      carried_forward_days: carried.toFixed(4),
      accrued_days: accrued.toFixed(4),
      adjusted_days: adjustments.toFixed(4),
      used_days: used.toFixed(4),
      expired_days: expired.toFixed(4),
      attendance_deduction_days: attendance.toFixed(4),
    },
    issues,
  };
}

/** Binds a review to the current source row and its calculated preview. */
export function openingPreviewFingerprint(balance: LeaveBalance): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        balance_id: balance.id,
        company_id: balance.company_id,
        employee_id: balance.employee_id,
        leave_type_id: balance.leave_type_id,
        fiscal_year: balance.fiscal_year,
        version: balance.version,
        preview: previewLegacyOpeningBalance(balance),
      }),
    )
    .digest('hex');
}
