export enum EmployeeInvitationStatus {
  PENDING = 'pending',
  ACCEPTING = 'accepting',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum EmployeeInvitationDeliveryStatus {
  QUEUED = 'queued',
  ACCEPTED = 'accepted',
  SENT = 'sent',
  FAILED = 'failed',
  /** HR did not choose this channel for the invitation. */
  SKIPPED = 'skipped',
}

export enum EmployeeInvitationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}
