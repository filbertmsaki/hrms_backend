import { NotificationRecipient } from './leave.events';

export class OnboardingEmployeeDetailsSubmittedEvent {
  static readonly EVENT = 'hr.onboarding.employee_details_submitted';
  constructor(
    public readonly companyId: number,
    public readonly onboardingRequestId: number,
    public readonly onboardingNo: string,
    public readonly employeeName: string,
    public readonly reviewerCompanyUserId: number,
    public readonly employeeCompanyUserId: number,
    public readonly reviewUrl: string,
  ) {}
}

export class OnboardingEmployeeDetailsReturnedEvent {
  static readonly EVENT = 'hr.onboarding.employee_details_returned';
  constructor(
    public readonly companyId: number,
    public readonly onboardingRequestId: number,
    public readonly onboardingNo: string,
    public readonly employeeName: string,
    public readonly employeeCompanyUserId: number,
    public readonly reviewerCompanyUserId: number | null,
    public readonly sectionLabels: string[],
    public readonly employeeUrl: string,
  ) {}
}

export class OnboardingSubmittedEvent {
  static readonly EVENT = 'hr.onboarding.submitted';
  constructor(
    public readonly companyId: number,
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly approvers: NotificationRecipient[],
    public readonly reviewUrl: string,
    public readonly onboardingRequestId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
    public readonly onboardingNo: string | null,
  ) {}
}

export class OnboardingApprovalRequiredEvent {
  static readonly EVENT = 'hr.onboarding.approval_required';
  constructor(
    public readonly employeeName: string,
    public readonly approvers: NotificationRecipient[],
    public readonly reviewUrl: string,
    public readonly onboardingRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly onboardingNo: string | null,
  ) {}
}

export class OnboardingApprovedEvent {
  static readonly EVENT = 'hr.onboarding.approved';
  constructor(
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly hrRecipients: NotificationRecipient[],
    public readonly dashboardUrl: string,
    public readonly onboardingRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
    public readonly onboardingNo: string | null,
  ) {}
}

export class OnboardingRejectedEvent {
  static readonly EVENT = 'hr.onboarding.rejected';
  constructor(
    public readonly employeeName: string,
    public readonly employeeEmail: string,
    public readonly rejectionComments: string | null,
    public readonly dashboardUrl: string,
    public readonly onboardingRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
    public readonly onboardingNo: string | null,
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
    public readonly companyId: number,
    public readonly onboardingRequestId: number,
    public readonly taskId: number,
    public readonly assigneeCompanyUserId: number | null,
    public readonly senderCompanyUserId: number | null,
    public readonly taskNo: string | null,
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
    public readonly onboardingRequestId: number,
    public readonly companyId: number,
    public readonly senderCompanyUserId: number | null,
    public readonly employeeCompanyUserId: number | null,
    public readonly managerCompanyUserId: number | null,
    public readonly onboardingNo: string | null,
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

export class OnboardingTaskCompletedEvent {
  static readonly EVENT = 'hr.onboarding.task_completed';
  constructor(
    public readonly companyId: number,
    public readonly onboardingRequestId: number,
    public readonly taskId: number,
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
