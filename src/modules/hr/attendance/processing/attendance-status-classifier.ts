import { AttendanceDailyStatusEnum } from './enums/attendance-daily-status.enum';
import {
  AttendanceArrivalStatus,
  AttendanceDepartureStatus,
  AttendancePunchStatus,
  AttendanceStatus,
} from './enums/attendance-status-dimensions.enum';

/**
 * A check-out later than schedule end + max(grace-out, this) is a late
 * departure. Late departure is informational only — overtime is calculated
 * separately by the engine and is never inferred from this status.
 */
export const LATE_DEPARTURE_TOLERANCE_MINUTES = 15;

export type AttendanceStatusClassifierInput = {
  /**
   * The engine's composite status for the day (after exemption). For a
   * manually-corrected day pass the status recalculated from the corrected
   * punches, or the HR status override when one was set.
   */
  legacyStatus: AttendanceDailyStatusEnum;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  scheduleStartAt: Date | null;
  scheduleEndAt: Date | null;
  graceInMinutes: number;
  lateAfterMinutes: number;
  graceOutMinutes: number;
  earlyLeaveAfterMinutes: number;
  requiresCheckout: boolean;
  autoAbsentIfNoCheckin: boolean;
  /** The attendance cutoff (processing window) for the day has passed. */
  cutoffPassed: boolean;
  hasInvalidPunches: boolean;
  attendanceExempt: boolean;
};

export type AttendanceStatusDimensions = {
  primaryStatus: AttendanceStatus;
  punchStatus: AttendancePunchStatus;
  arrivalStatus: AttendanceArrivalStatus;
  departureStatus: AttendanceDepartureStatus;
  /** Present on the strength of a partial punch record only. */
  isProvisional: boolean;
};

const LEAVE_STATUSES = new Set<string>([
  AttendanceDailyStatusEnum.LEAVE,
  AttendanceDailyStatusEnum.SICK_LEAVE,
  AttendanceDailyStatusEnum.ANNUAL_LEAVE,
  AttendanceDailyStatusEnum.UNPAID_LEAVE,
]);

const PRESENT_STATUSES = new Set<string>([
  AttendanceDailyStatusEnum.PRESENT,
  AttendanceDailyStatusEnum.LATE,
  AttendanceDailyStatusEnum.EARLY_DEPARTURE,
  AttendanceDailyStatusEnum.LATE_AND_EARLY_DEPARTURE,
  AttendanceDailyStatusEnum.OVERTIME,
  AttendanceDailyStatusEnum.OFF_DAY_PRESENT,
  AttendanceDailyStatusEnum.MANUAL_CORRECTION,
]);

/** Days on which no attendance is expected from the employee. */
const NOT_REQUIRED_PRIMARY = new Set<AttendanceStatus>([
  AttendanceStatus.LEAVE,
  AttendanceStatus.OFFICIAL_DUTY,
  AttendanceStatus.OFF_DAY,
  AttendanceStatus.HOLIDAY,
  AttendanceStatus.NOT_APPLICABLE,
  AttendanceStatus.NO_SHIFT_SCHEDULE,
]);

function mapPrimary(
  input: AttendanceStatusClassifierInput,
  hasAnyPunch: boolean,
): AttendanceStatus {
  const legacy = input.legacyStatus;
  if (LEAVE_STATUSES.has(legacy)) return AttendanceStatus.LEAVE;
  if (
    legacy === AttendanceDailyStatusEnum.BUSINESS_TRIP ||
    legacy === AttendanceDailyStatusEnum.OFFICIAL_DUTY
  ) {
    return AttendanceStatus.OFFICIAL_DUTY;
  }
  if (legacy === AttendanceDailyStatusEnum.HOLIDAY)
    return AttendanceStatus.HOLIDAY;
  if (legacy === AttendanceDailyStatusEnum.OFF_DAY)
    return AttendanceStatus.OFF_DAY;
  if (legacy === AttendanceDailyStatusEnum.NO_SHIFT_SCHEDULE) {
    return AttendanceStatus.NO_SHIFT_SCHEDULE;
  }
  if (legacy === AttendanceDailyStatusEnum.NOT_TRACKED) {
    return AttendanceStatus.NOT_APPLICABLE;
  }
  if (legacy === AttendanceDailyStatusEnum.HALF_DAY)
    return AttendanceStatus.HALF_DAY;
  if (PRESENT_STATUSES.has(legacy)) {
    return hasAnyPunch || legacy !== AttendanceDailyStatusEnum.MANUAL_CORRECTION
      ? AttendanceStatus.PRESENT
      : AttendanceStatus.UNDETERMINED;
  }
  if (legacy === AttendanceDailyStatusEnum.ABSENT) {
    // Absent-by-extreme-lateness keeps a real check-in: honour the policy.
    if (hasAnyPunch) return AttendanceStatus.ABSENT;
    // No punches yet: absence is only decided after the cutoff.
    if (!input.cutoffPassed) return AttendanceStatus.NOT_YET_CHECKED_IN;
    return input.autoAbsentIfNoCheckin
      ? AttendanceStatus.ABSENT
      : AttendanceStatus.UNDETERMINED;
  }
  return AttendanceStatus.UNDETERMINED;
}

function classifyPunches(
  input: AttendanceStatusClassifierInput,
  primary: AttendanceStatus,
): AttendancePunchStatus {
  const { checkInAt, checkOutAt } = input;
  const hasAnyPunch = !!checkInAt || !!checkOutAt;

  if (!hasAnyPunch && NOT_REQUIRED_PRIMARY.has(primary)) {
    return AttendancePunchStatus.NOT_REQUIRED;
  }
  if (input.hasInvalidPunches) return AttendancePunchStatus.INVALID;
  if (checkInAt && checkOutAt) return AttendancePunchStatus.COMPLETE;
  if (checkInAt) {
    if (!input.requiresCheckout) return AttendancePunchStatus.COMPLETE;
    return input.cutoffPassed
      ? AttendancePunchStatus.MISSING_CHECK_OUT
      : AttendancePunchStatus.IN_PROGRESS;
  }
  if (checkOutAt) return AttendancePunchStatus.MISSING_CHECK_IN;
  if (input.attendanceExempt) return AttendancePunchStatus.NOT_REQUIRED;
  return input.cutoffPassed
    ? AttendancePunchStatus.MISSING_BOTH
    : AttendancePunchStatus.IN_PROGRESS;
}

function classifyArrival(
  input: AttendanceStatusClassifierInput,
  primary: AttendanceStatus,
): AttendanceArrivalStatus {
  const { checkInAt, checkOutAt, scheduleStartAt } = input;
  const hasAnyPunch = !!checkInAt || !!checkOutAt;
  if (
    (!hasAnyPunch && NOT_REQUIRED_PRIMARY.has(primary)) ||
    input.attendanceExempt
  ) {
    return AttendanceArrivalStatus.NOT_APPLICABLE;
  }
  if (!checkInAt) {
    return !checkOutAt && !input.cutoffPassed
      ? AttendanceArrivalStatus.NOT_YET_CHECKED_IN
      : AttendanceArrivalStatus.UNKNOWN;
  }
  if (!scheduleStartAt) return AttendanceArrivalStatus.NOT_APPLICABLE;

  const lateThreshold =
    scheduleStartAt.getTime() +
    (Math.max(0, input.graceInMinutes) + Math.max(0, input.lateAfterMinutes)) *
      60000;
  if (checkInAt.getTime() > lateThreshold) return AttendanceArrivalStatus.LATE;
  if (checkInAt.getTime() < scheduleStartAt.getTime()) {
    return AttendanceArrivalStatus.EARLY_ARRIVAL;
  }
  return AttendanceArrivalStatus.ON_TIME;
}

function classifyDeparture(
  input: AttendanceStatusClassifierInput,
  primary: AttendanceStatus,
): AttendanceDepartureStatus {
  const { checkInAt, checkOutAt, scheduleEndAt } = input;
  const hasAnyPunch = !!checkInAt || !!checkOutAt;
  if (
    (!hasAnyPunch && NOT_REQUIRED_PRIMARY.has(primary)) ||
    input.attendanceExempt
  ) {
    return AttendanceDepartureStatus.NOT_APPLICABLE;
  }
  if (!checkOutAt) {
    return checkInAt && !input.cutoffPassed
      ? AttendanceDepartureStatus.NOT_YET_CHECKED_OUT
      : AttendanceDepartureStatus.UNKNOWN;
  }
  if (!scheduleEndAt) return AttendanceDepartureStatus.NOT_APPLICABLE;

  const end = scheduleEndAt.getTime();
  const earlyThreshold =
    end -
    (Math.max(0, input.graceOutMinutes) +
      Math.max(0, input.earlyLeaveAfterMinutes)) *
      60000;
  if (checkOutAt.getTime() < earlyThreshold) {
    return AttendanceDepartureStatus.EARLY_DEPARTURE;
  }
  const lateThreshold =
    end +
    Math.max(input.graceOutMinutes, LATE_DEPARTURE_TOLERANCE_MINUTES) * 60000;
  if (checkOutAt.getTime() > lateThreshold) {
    return AttendanceDepartureStatus.LATE_DEPARTURE;
  }
  return AttendanceDepartureStatus.ON_TIME;
}

/**
 * Single source of truth for the four status dimensions. Pure: no I/O, no
 * clock (the caller decides whether the cutoff has passed).
 */
export function classifyAttendanceStatuses(
  input: AttendanceStatusClassifierInput,
): AttendanceStatusDimensions {
  const hasAnyPunch = !!input.checkInAt || !!input.checkOutAt;
  const primaryStatus = mapPrimary(input, hasAnyPunch);
  const punchStatus = classifyPunches(input, primaryStatus);
  const arrivalStatus = classifyArrival(input, primaryStatus);
  const departureStatus = classifyDeparture(input, primaryStatus);
  const isProvisional =
    (primaryStatus === AttendanceStatus.PRESENT ||
      primaryStatus === AttendanceStatus.HALF_DAY) &&
    punchStatus !== AttendancePunchStatus.COMPLETE &&
    punchStatus !== AttendancePunchStatus.NOT_REQUIRED;

  return {
    primaryStatus,
    punchStatus,
    arrivalStatus,
    departureStatus,
    isProvisional,
  };
}
