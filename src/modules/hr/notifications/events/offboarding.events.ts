import { NotificationRecipient } from './leave.events';

export class OffboardingSubmittedEvent {
  static readonly EVENT = 'hr.offboarding.submitted';
  constructor(
    public readonly companyId: number,
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly exitDate: string | null,
    public readonly approvers: NotificationRecipient[],
    public readonly reviewUrl: string,
    public readonly offboardingRequestId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
  ) {}
}

export class OffboardingApprovalRequiredEvent {
  static readonly EVENT = 'hr.offboarding.approval_required';
  constructor(
    public readonly employeeName: string,
    public readonly exitDate: string | null,
    public readonly approvers: NotificationRecipient[],
    public readonly reviewUrl: string,
    public readonly offboardingRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
  ) {}
}

export class OffboardingApprovedEvent {
  static readonly EVENT = 'hr.offboarding.approved';
  constructor(
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly exitDate: string | null,
    public readonly hrRecipients: NotificationRecipient[],
    public readonly dashboardUrl: string,
    public readonly offboardingRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
  ) {}
}

export class OffboardingTaskAssignedEvent {
  static readonly EVENT = 'hr.offboarding.task_assigned';
  constructor(
    public readonly assigneeName: string,
    public readonly assigneeEmail: string,
    public readonly employeeName: string,
    public readonly taskTitle: string,
    public readonly taskDescription: string | null,
    public readonly dueDate: Date | null,
    public readonly exitDate: string | null,
    public readonly taskUrl: string,
    public readonly companyId: number,
    public readonly offboardingRequestId: number,
    public readonly taskId: number,
    public readonly assigneeCompanyUserId: number | null,
    public readonly senderCompanyUserId: number | null,
  ) {}
}

export class OffboardingClearanceRequiredEvent {
  static readonly EVENT = 'hr.offboarding.clearance_required';
  constructor(
    public readonly ownerName: string,
    public readonly ownerEmail: string,
    public readonly employeeName: string,
    public readonly clearanceType: string,
    public readonly exitDate: string | null,
    public readonly clearanceUrl: string,
    public readonly companyId: number,
    public readonly offboardingRequestId: number,
    public readonly clearanceId: number,
    public readonly ownerCompanyUserId: number | null,
    public readonly senderCompanyUserId: number | null,
  ) {}
}

export class OffboardingCompletedEvent {
  static readonly EVENT = 'hr.offboarding.completed';
  constructor(
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly exitDate: string | null,
    public readonly managerEmail: string | null,
    public readonly managerName: string | null,
    public readonly hrRecipients: NotificationRecipient[],
    public readonly offboardingRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
    public readonly managerCompanyUserId: number | null,
  ) {}
}

export class OffboardingTaskOverdueEvent {
  static readonly EVENT = 'hr.offboarding.task_overdue';
  constructor(
    public readonly companyId: number,
    public readonly offboardingRequestId: number,
    public readonly taskId: number,
    public readonly taskTitle: string,
    public readonly employeeName: string,
    public readonly assigneeCompanyUserId: number | null,
    public readonly assigneeName: string | null,
    public readonly assigneeEmail: string | null,
    public readonly dueDate: Date,
    public readonly exitDate: string | null,
    public readonly taskUrl: string,
  ) {}
}

export class OffboardingClearanceOverdueEvent {
  static readonly EVENT = 'hr.offboarding.clearance_overdue';
  constructor(
    public readonly companyId: number,
    public readonly offboardingRequestId: number,
    public readonly clearanceId: number,
    public readonly clearanceType: string,
    public readonly employeeName: string,
    public readonly ownerCompanyUserId: number | null,
    public readonly ownerName: string | null,
    public readonly ownerEmail: string | null,
    public readonly dueDate: Date,
    public readonly exitDate: string | null,
    public readonly clearanceUrl: string,
  ) {}
}

export class OffboardingApprovalReminderEvent {
  static readonly EVENT = 'hr.offboarding.approval_reminder';
  constructor(
    public readonly companyId: number,
    public readonly offboardingRequestId: number,
    public readonly approvalId: number,
    public readonly approvalLevel: number | null,
    public readonly employeeName: string,
    public readonly approverCompanyUserId: number | null,
    public readonly approverName: string | null,
    public readonly approverEmail: string | null,
    public readonly exitDate: string | null,
    public readonly reviewUrl: string,
  ) {}
}
