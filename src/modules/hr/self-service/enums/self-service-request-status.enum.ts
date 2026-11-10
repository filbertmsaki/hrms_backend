export enum SelfServiceRequestStatusEnum {
  DRAFT = 'draft',
  /** @deprecated legacy single-step status; migrated to PENDING_MANAGER_APPROVAL */
  SUBMITTED = 'submitted',
  PENDING_MANAGER_APPROVAL = 'pending_manager_approval',
  PENDING_HR_APPROVAL = 'pending_hr_approval',
  RETURNED_FOR_CORRECTION = 'returned_for_correction',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

/** Statuses awaiting a reviewer decision. */
export const SELF_SERVICE_PENDING_STATUSES = [
  SelfServiceRequestStatusEnum.SUBMITTED,
  SelfServiceRequestStatusEnum.PENDING_MANAGER_APPROVAL,
  SelfServiceRequestStatusEnum.PENDING_HR_APPROVAL,
] as const;

/** Statuses the employee may still edit, attach evidence to, and (re)submit. */
export const SELF_SERVICE_EDITABLE_STATUSES = [
  SelfServiceRequestStatusEnum.DRAFT,
  SelfServiceRequestStatusEnum.RETURNED_FOR_CORRECTION,
] as const;

/** Statuses the employee may cancel. */
export const SELF_SERVICE_CANCELLABLE_STATUSES = [
  ...SELF_SERVICE_EDITABLE_STATUSES,
  ...SELF_SERVICE_PENDING_STATUSES,
] as const;
