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
