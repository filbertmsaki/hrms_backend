export enum AttendanceDailyStatusEnum {
  PRESENT = 'PRESENT',
  LATE = 'LATE',
  EARLY_DEPARTURE = 'EARLY_DEPARTURE',
  OVERTIME = 'OVERTIME',
  HALF_DAY = 'HALF_DAY',
  ABSENT = 'ABSENT',
  MISSING_CHECKOUT = 'MISSING_CHECKOUT',
  /** @deprecated Replaced by MISSING_CHECKOUT. Kept for backwards compatibility with existing records. */
  INCOMPLETE = 'INCOMPLETE',
  OFF_DAY = 'OFF_DAY',
  HOLIDAY = 'HOLIDAY',
  LEAVE = 'LEAVE',
  SICK = 'SICK',
  ANNUAL_LEAVE = 'ANNUAL_LEAVE',
  UNPAID_LEAVE = 'UNPAID_LEAVE',
  /** @deprecated Replaced by LEAVE/SICK/ANNUAL_LEAVE/UNPAID_LEAVE. Kept for backwards compatibility. */
  ON_LEAVE = 'ON_LEAVE',
  BUSINESS_TRIP = 'BUSINESS_TRIP',
  MANUAL_CORRECTION = 'MANUAL_CORRECTION',
}
