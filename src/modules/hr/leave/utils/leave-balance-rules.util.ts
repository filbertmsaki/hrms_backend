import { LeaveGenderRestrictionEnum } from '../enums/leave-gender-restriction.enum';
import type { LeaveBalance } from '../entities/leave-balance.entity';
import type { LeaveType } from '../entities/leave-type.entity';

type AvailableDaysSource = Pick<
  LeaveBalance,
  | 'opening_balance_days'
  | 'carried_forward_days'
  | 'accrued_days'
  | 'entitlement_days'
  | 'allocated_days'
  | 'adjusted_days'
  | 'used_days'
  | 'pending_days'
  | 'approved_future_days'
  | 'expired_days'
  | 'attendance_deduction_days'
> &
  Partial<Pick<LeaveBalance, 'retained_days'>>;

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Opening / carried-forward days for a balance. Decimal columns arrive as
 * strings, and "0.00" is truthy, so `opening || carried` would wrongly pick
 * a zero opening over a real carried-forward figure.
 */
export function openingOrCarriedDays(
  balance: Pick<LeaveBalance, 'opening_balance_days' | 'carried_forward_days'>,
): number {
  return toNumber(balance.opening_balance_days)
    ? toNumber(balance.opening_balance_days)
    : toNumber(balance.carried_forward_days);
}

/**
 * The one available-leave formula. Every screen, report, import, request
 * check and balance-history entry uses it; they differ only in which accrual
 * they plug in:
 * - default: accrued to date (`accrued_days`) — "available now";
 * - `accruedDays` = accrual as of the leave's last day — what an accruing
 *   policy lets an employee book (LeaveService.assertWithinAccruedEntitlement);
 * - `accruedDays` = the full-year entitlement — the ledger's upper bound on
 *   reservations.
 */
export function calculateAvailableLeaveDays(
  balance: AvailableDaysSource,
  options: { accruedDays?: number } = {},
): number {
  const openingBalance = openingOrCarriedDays(balance);
  // Older rows may hold 0 accrual, so 0 falls back to the entitlement.
  const accruedDays =
    options.accruedDays !== undefined
      ? options.accruedDays
      : toNumber(balance.accrued_days)
        ? toNumber(balance.accrued_days)
        : toNumber(balance.entitlement_days) ||
          toNumber(balance.allocated_days);

  return (
    openingBalance +
    toNumber(balance.retained_days) +
    accruedDays +
    toNumber(balance.adjusted_days) -
    toNumber(balance.used_days) -
    toNumber(balance.pending_days) -
    toNumber(balance.approved_future_days) -
    toNumber(balance.expired_days) -
    toNumber(balance.attendance_deduction_days)
  );
}

/**
 * Gender restriction configured on the leave type. An employee without a
 * recorded gender is not excluded, matching leave request validation.
 */
export function isEmployeeEligibleForLeaveType(
  employee: { gender?: string | null },
  leaveType: Pick<LeaveType, 'gender_restriction'>,
): boolean {
  if (
    !leaveType.gender_restriction ||
    leaveType.gender_restriction === LeaveGenderRestrictionEnum.ANY
  ) {
    return true;
  }

  if (!employee.gender) {
    return true;
  }

  return (
    (employee.gender.toLowerCase() as LeaveGenderRestrictionEnum) ===
    leaveType.gender_restriction
  );
}

/**
 * Whether a balance row should be listed for its employee: only leave types
 * their gender is eligible for (everything when no gender is recorded). A row
 * that already has activity stays visible so history is never hidden.
 */
export function isLeaveBalanceVisibleForEmployee(
  employee: { gender?: string | null },
  balance: {
    leave_type?: Pick<LeaveType, 'gender_restriction'> | null;
    used_days?: string | number | null;
    pending_days?: string | number | null;
    approved_future_days?: string | number | null;
    adjusted_days?: string | number | null;
  },
): boolean {
  if (!balance.leave_type) return true;
  if (isEmployeeEligibleForLeaveType(employee, balance.leave_type)) return true;
  return [
    balance.used_days,
    balance.pending_days,
    balance.approved_future_days,
    balance.adjusted_days,
  ].some((value) => Number(value ?? 0) !== 0);
}
