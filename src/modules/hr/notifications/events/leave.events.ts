export type NotificationRecipient = {
  companyUserId?: number | null;
  employeeId?: number | null;
  branchId?: number | null;
  departmentId?: number | null;
  name: string;
  email: string;
};

export class LeaveSubmittedEvent {
  static readonly EVENT = 'hr.leave.submitted';
  constructor(
    public readonly companyId: number,
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly leaveTypeName: string,
    public readonly startDate: string,
    public readonly endDate: string,
    public readonly totalDays: number,
    public readonly reason: string | null,
    public readonly approvers: NotificationRecipient[],
    public readonly reviewUrl: string,
    public readonly leaveRequestId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
    public readonly approvalCycle: number = 1,
  ) {}
}

export class LeaveApprovalRequiredEvent {
  static readonly EVENT = 'hr.leave.approval_required';
  constructor(
    public readonly employeeName: string,
    public readonly leaveTypeName: string,
    public readonly startDate: string,
    public readonly endDate: string,
    public readonly totalDays: number,
    public readonly approvers: NotificationRecipient[],
    public readonly reviewUrl: string,
    public readonly leaveRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly approvalCycle: number = 1,
  ) {}
}

/** A leave approval stage has waited longer than the workflow allows. */
export class LeaveApprovalReminderEvent {
  static readonly EVENT = 'hr.leave.approval_reminder';
  constructor(
    public readonly employeeName: string,
    public readonly leaveTypeName: string,
    public readonly daysWaiting: number,
    public readonly approverCompanyUserIds: number[],
    public readonly reviewUrl: string,
    public readonly leaveRequestId: number,
    public readonly approvalCycle: number,
    public readonly approvalLevel: number,
    public readonly companyId: number,
  ) {}
}

/** A leave request cleared one approval level and moved to the next. */
export class LeaveForwardedEvent {
  static readonly EVENT = 'hr.leave.forwarded';
  constructor(
    public readonly leaveTypeName: string,
    public readonly nextStageLabel: string,
    public readonly dashboardUrl: string,
    public readonly leaveRequestId: number,
    public readonly approvalCycle: number,
    public readonly approvalLevel: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
  ) {}
}

export class LeaveApprovedEvent {
  static readonly EVENT = 'hr.leave.approved';
  constructor(
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly leaveTypeName: string,
    public readonly startDate: string,
    public readonly endDate: string,
    public readonly totalDays: number,
    public readonly dashboardUrl: string,
    public readonly leaveRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
  ) {}
}

export class LeaveRejectedEvent {
  static readonly EVENT = 'hr.leave.rejected';
  constructor(
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly leaveTypeName: string,
    public readonly startDate: string,
    public readonly endDate: string,
    public readonly rejectionComments: string | null,
    public readonly dashboardUrl: string,
    public readonly leaveRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
  ) {}
}

export class LeaveReturnedForCorrectionEvent {
  static readonly EVENT = 'hr.leave.returned_for_correction';
  constructor(
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly leaveTypeName: string,
    public readonly startDate: string,
    public readonly endDate: string,
    public readonly returnReason: string | null,
    public readonly dashboardUrl: string,
    public readonly leaveRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
  ) {}
}

export class LeaveCancelledEvent {
  static readonly EVENT = 'hr.leave.cancelled';
  constructor(
    public readonly employeeName: string,
    public readonly leaveTypeName: string,
    public readonly startDate: string,
    public readonly endDate: string,
    public readonly pendingApprovers: NotificationRecipient[],
    public readonly leaveRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
  ) {}
}

/**
 * Leave lifecycle events beyond request approval (end early, encashment,
 * comp-off, rollover, carry-forward expiry, exit settlement). Delivered
 * in-app and by email through the notification orchestrator; each
 * `eventKey` can be switched off or re-channelled by an admin notification
 * rule. Emit after the transaction commits.
 */
export type LeaveLifecycleEventKey =
  | 'leave.end_early'
  | 'leave.cancellation_decided'
  | 'leave.encashment.requested'
  | 'leave.encashment.approved'
  | 'leave.encashment.rejected'
  | 'leave.encashment.submitted_to_payroll'
  | 'leave.encashment.paid'
  | 'leave.encashment.payment_failed'
  | 'leave.encashment.reversed'
  | 'leave.comp_off.requested'
  | 'leave.comp_off.approved'
  | 'leave.comp_off.rejected'
  | 'leave.comp_off.credited'
  | 'leave.comp_off.expired'
  | 'leave.rollover.completed'
  | 'leave.carry_forward.expiry_approaching'
  | 'leave.balance.forfeited'
  | 'leave.exit_settlement.initiated'
  | 'leave.exit_settlement.approved'
  | 'leave.exit_settlement.submitted_to_payroll'
  | 'leave.exit_settlement.completed'
  | 'leave.exit_settlement.failed';

export const LEAVE_LIFECYCLE_EVENT_KEYS: LeaveLifecycleEventKey[] = [
  'leave.end_early',
  'leave.cancellation_decided',
  'leave.encashment.requested',
  'leave.encashment.approved',
  'leave.encashment.rejected',
  'leave.encashment.submitted_to_payroll',
  'leave.encashment.paid',
  'leave.encashment.payment_failed',
  'leave.encashment.reversed',
  'leave.comp_off.requested',
  'leave.comp_off.approved',
  'leave.comp_off.rejected',
  'leave.comp_off.credited',
  'leave.comp_off.expired',
  'leave.rollover.completed',
  'leave.carry_forward.expiry_approaching',
  'leave.balance.forfeited',
  'leave.exit_settlement.initiated',
  'leave.exit_settlement.approved',
  'leave.exit_settlement.submitted_to_payroll',
  'leave.exit_settlement.completed',
  'leave.exit_settlement.failed',
];

export class LeaveLifecycleNotificationEvent {
  static readonly EVENT = 'hr.leave.lifecycle';
  constructor(
    public readonly input: {
      companyId: number;
      eventKey: LeaveLifecycleEventKey;
      title: string;
      message: string;
      /** The employee concerned (notified via their company user, if any). */
      employeeId?: number | null;
      /** Also notify every HR user of the company. */
      notifyHr?: boolean;
      /** Extra specific recipients (company user ids). */
      recipientCompanyUserIds?: number[];
      senderCompanyUserId?: number | null;
      entityType: string;
      entityId: number | string;
      actionUrl?: string | null;
      /** Unique per real-world occurrence; receiver id is appended. */
      dedupeKey: string;
      priority?: 'low' | 'medium' | 'high';
      metadata?: Record<string, unknown>;
    },
  ) {}
}
