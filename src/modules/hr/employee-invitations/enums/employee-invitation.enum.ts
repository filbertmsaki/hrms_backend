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
}

export enum EmployeeInvitationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}
