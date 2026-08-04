export enum OffboardingRequestStatusEnum {
  DRAFT = 'draft',
  PENDING_MANAGER = 'pending_manager',
  WAITING_APPROVAL = 'waiting_approval',
  IN_PROGRESS = 'in_progress',
  READY_FOR_TERMINATION = 'ready_for_termination',
  TERMINATION_SCHEDULED = 'termination_scheduled',
  TERMINATING_ACCESS = 'terminating_access',
  ACCESS_TERMINATION_FAILED = 'access_termination_failed',
  READY_FOR_FINALIZATION = 'ready_for_finalization',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}
