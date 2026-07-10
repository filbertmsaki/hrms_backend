export enum LeaveStatusEnum {
  DRAFT = 'draft',
  /** @deprecated legacy generic-workflow status, no longer produced by new code */
  SUBMITTED = 'submitted',
  /** @deprecated legacy generic-workflow status, no longer produced by new code */
  IN_REVIEW = 'in_review',
  PENDING_DEPARTMENT_MANAGER = 'pending_department_manager',
  PENDING_HR = 'pending_hr',
  RETURNED_FOR_CORRECTION = 'returned_for_correction',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}
