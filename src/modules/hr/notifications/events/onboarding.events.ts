import { NotificationRecipient } from './leave.events';

export class OnboardingSubmittedEvent {
  static readonly EVENT = 'hr.onboarding.submitted';
  constructor(
    public readonly companyId: number,
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly approvers: NotificationRecipient[],
    public readonly reviewUrl: string,
  ) {}
}

export class OnboardingApprovalRequiredEvent {
  static readonly EVENT = 'hr.onboarding.approval_required';
  constructor(
    public readonly employeeName: string,
    public readonly approvers: NotificationRecipient[],
    public readonly reviewUrl: string,
  ) {}
}

export class OnboardingApprovedEvent {
  static readonly EVENT = 'hr.onboarding.approved';
  constructor(
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly hrRecipients: NotificationRecipient[],
    public readonly dashboardUrl: string,
  ) {}
}

export class OnboardingRejectedEvent {
  static readonly EVENT = 'hr.onboarding.rejected';
  constructor(
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly rejectionComments: string | null,
    public readonly dashboardUrl: string,
  ) {}
}

export class OnboardingTaskAssignedEvent {
  static readonly EVENT = 'hr.onboarding.task_assigned';
  constructor(
    public readonly assigneeName: string,
    public readonly assigneeEmail: string,
    public readonly employeeName: string,
    public readonly taskTitle: string,
    public readonly taskDescription: string | null,
    public readonly dueDate: Date | null,
    public readonly taskUrl: string,
  ) {}
}

export class OnboardingCompletedEvent {
  static readonly EVENT = 'hr.onboarding.completed';
  constructor(
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly managerEmail: string | null,
    public readonly managerName: string | null,
    public readonly dashboardUrl: string,
  ) {}
}

export class OnboardingTaskOverdueEvent {
  static readonly EVENT = 'hr.onboarding.task_overdue';
  constructor(
    public readonly companyId: number,
    public readonly onboardingRequestId: number,
    public readonly taskId: number,
    public readonly taskTitle: string,
    public readonly employeeName: string,
    public readonly assignedCompanyUserId: number | null,
    public readonly dueDate: Date,
  ) {}
}

export class OnboardingApprovalReminderEvent {
  static readonly EVENT = 'hr.onboarding.approval_reminder';
  constructor(
    public readonly companyId: number,
    public readonly onboardingRequestId: number,
    public readonly approvalId: number,
    public readonly approvalLevel: number,
    public readonly employeeName: string,
    public readonly approverCompanyUserIds: number[],
  ) {}
}
