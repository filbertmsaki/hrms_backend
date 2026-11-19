export enum LeaveAccrualMethodEnum {
  /** Pro-rata by exact days employed in the leave year. */
  DAILY = 'daily',
  /** Entitlement ÷ 52 per 7-day period from the accrual start. */
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  /**
   * One credit per leave cycle. With accrual_timing in_advance (default)
   * this is the upfront allocation at the start of the eligible period;
   * in_arrears credits at cycle end.
   */
  YEARLY = 'yearly',
  MANUAL = 'manual',
}
