export const OFFBOARDING_ACCESS_TERMINATION_DISPATCH_LOCK_KEY =
  'offboarding:access-termination-dispatch';

export interface OffboardingAccessTerminationJobData {
  companyId: number;
  offboardingRequestId: number;
}
