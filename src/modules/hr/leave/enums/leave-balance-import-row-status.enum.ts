/** Outcome of validating a single Employee + Leave Type row. */
export enum LeaveBalanceImportValidationStatusEnum {
  VALID = 'VALID',
  WARNING = 'WARNING',
  INVALID = 'INVALID',
  NO_CHANGE = 'NO_CHANGE',
}

/** Outcome of the confirmed import for a single row. */
export enum LeaveBalanceImportResultStatusEnum {
  IMPORTED = 'IMPORTED',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}
