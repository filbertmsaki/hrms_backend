/**
 * The four independent attendance status dimensions. Each is calculated on
 * its own by AttendanceStatusClassifier, so a day can be e.g. PRESENT +
 * LATE arrival + MISSING_CHECK_OUT at once.
 *
 * The legacy composite `attendance_status` column (AttendanceDailyStatusEnum)
 * is kept unchanged for payroll and leave consumers.
 */
export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  HALF_DAY = 'HALF_DAY',
  LEAVE = 'LEAVE',
  OFFICIAL_DUTY = 'OFFICIAL_DUTY',
  OFF_DAY = 'OFF_DAY',
  HOLIDAY = 'HOLIDAY',
  NO_SHIFT_SCHEDULE = 'NO_SHIFT_SCHEDULE',
  NOT_YET_CHECKED_IN = 'NOT_YET_CHECKED_IN',
  UNDETERMINED = 'UNDETERMINED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum AttendancePunchStatus {
  COMPLETE = 'COMPLETE',
  MISSING_CHECK_IN = 'MISSING_CHECK_IN',
  MISSING_CHECK_OUT = 'MISSING_CHECK_OUT',
  MISSING_BOTH = 'MISSING_BOTH',
  IN_PROGRESS = 'IN_PROGRESS',
  INVALID = 'INVALID',
  NOT_REQUIRED = 'NOT_REQUIRED',
}

export enum AttendanceDepartureStatus {
  ON_TIME = 'ON_TIME',
  EARLY_DEPARTURE = 'EARLY_DEPARTURE',
  LATE_DEPARTURE = 'LATE_DEPARTURE',
  NOT_YET_CHECKED_OUT = 'NOT_YET_CHECKED_OUT',
  UNKNOWN = 'UNKNOWN',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum AttendanceArrivalStatus {
  ON_TIME = 'ON_TIME',
  EARLY_ARRIVAL = 'EARLY_ARRIVAL',
  LATE = 'LATE',
  NOT_YET_CHECKED_IN = 'NOT_YET_CHECKED_IN',
  UNKNOWN = 'UNKNOWN',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  HALF_DAY: 'Half Day',
  LEAVE: 'On Leave',
  OFFICIAL_DUTY: 'Official Duty',
  OFF_DAY: 'Off Day',
  HOLIDAY: 'Holiday',
  NO_SHIFT_SCHEDULE: 'No Shift Scheduled',
  NOT_YET_CHECKED_IN: 'Not Yet Checked In',
  UNDETERMINED: 'Undetermined',
  NOT_APPLICABLE: 'Not Applicable',
};

export const ATTENDANCE_PUNCH_STATUS_LABELS: Record<
  AttendancePunchStatus,
  string
> = {
  COMPLETE: 'Complete',
  MISSING_CHECK_IN: 'Missing Check-In',
  MISSING_CHECK_OUT: 'Missing Check-Out',
  MISSING_BOTH: 'Missing Both Punches',
  IN_PROGRESS: 'In Progress',
  INVALID: 'In Progress',
  NOT_REQUIRED: 'Not Required',
};

export const ATTENDANCE_ARRIVAL_STATUS_LABELS: Record<
  AttendanceArrivalStatus,
  string
> = {
  ON_TIME: 'On Time',
  EARLY_ARRIVAL: 'Early Arrival',
  LATE: 'Late Arrival',
  NOT_YET_CHECKED_IN: 'Not Yet Checked In',
  UNKNOWN: 'Unknown',
  NOT_APPLICABLE: 'Not Applicable',
};

export const ATTENDANCE_DEPARTURE_STATUS_LABELS: Record<
  AttendanceDepartureStatus,
  string
> = {
  ON_TIME: 'On Time',
  EARLY_DEPARTURE: 'Early Departure',
  LATE_DEPARTURE: 'Late Departure',
  NOT_YET_CHECKED_OUT: 'Not Yet Checked Out',
  UNKNOWN: 'Unknown',
  NOT_APPLICABLE: 'Not Applicable',
};

/** Display labels for all four dimensions of one summary row. */
export function buildStatusDimensionLabels(row: {
  primaryStatus?: string | null;
  punchStatus?: string | null;
  arrivalStatus?: string | null;
  departureStatus?: string | null;
  isProvisional?: boolean | null;
  leaveTypeName?: string | null;
}): {
  primaryStatusLabel: string;
  punchStatusLabel: string;
  arrivalStatusLabel: string;
  departureStatusLabel: string;
} {
  return {
    primaryStatusLabel: formatPrimaryAttendanceStatus(
      row.primaryStatus,
      row.leaveTypeName,
      !!row.isProvisional,
    ),
    punchStatusLabel: row.punchStatus
      ? (ATTENDANCE_PUNCH_STATUS_LABELS[
          row.punchStatus as AttendancePunchStatus
        ] ?? row.punchStatus)
      : '',
    arrivalStatusLabel: row.arrivalStatus
      ? (ATTENDANCE_ARRIVAL_STATUS_LABELS[
          row.arrivalStatus as AttendanceArrivalStatus
        ] ?? row.arrivalStatus)
      : '',
    departureStatusLabel: row.departureStatus
      ? (ATTENDANCE_DEPARTURE_STATUS_LABELS[
          row.departureStatus as AttendanceDepartureStatus
        ] ?? row.departureStatus)
      : '',
  };
}

/** Primary status label; LEAVE shows the actual leave type name when known. */
export function formatPrimaryAttendanceStatus(
  status: string | null | undefined,
  leaveTypeName?: string | null,
  isProvisional?: boolean,
): string {
  if (!status) return '';
  if (
    (status as AttendanceStatus) === AttendanceStatus.LEAVE &&
    leaveTypeName
  ) {
    return leaveTypeName;
  }
  const label = ATTENDANCE_STATUS_LABELS[status as AttendanceStatus] ?? status;
  return isProvisional &&
    (status as AttendanceStatus) !== AttendanceStatus.PRESENT
    ? `${label} (Provisional)`
    : label;
}
