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
  ) {}
}

export class OffboardingApprovalRequiredEvent {
  static readonly EVENT = 'hr.offboarding.approval_required';
  constructor(
    public readonly employeeName: string,
    public readonly exitDate: string | null,
    public readonly approvers: NotificationRecipient[],
    public readonly reviewUrl: string,
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
  ) {}
}
