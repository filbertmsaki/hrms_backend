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
>;

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * The authoritative available leave balance. Leave Management, analytics,
 * reports and the bulk balance import all read balances through this
 * formula, so a balance shown anywhere in the HRMS is the same number.
 */
export function calculateAvailableLeaveDays(
  balance: AvailableDaysSource,
): number {
  const openingBalance = toNumber(balance.opening_balance_days)
    ? toNumber(balance.opening_balance_days)
    : toNumber(balance.carried_forward_days);
  const accruedDays = toNumber(balance.accrued_days)
    ? toNumber(balance.accrued_days)
    : toNumber(balance.entitlement_days) || toNumber(balance.allocated_days);

  return (
    openingBalance +
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
