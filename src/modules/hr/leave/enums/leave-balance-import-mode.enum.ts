export enum LeaveBalanceImportModeEnum {
  /** Nothing is imported unless every row is valid; one failure rolls back the batch. */
  STRICT = 'STRICT',
  /** Valid rows are imported; invalid and conflicting rows are skipped. */
  VALID_ROWS_ONLY = 'VALID_ROWS_ONLY',
}
