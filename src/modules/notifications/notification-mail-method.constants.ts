export type NotificationMailMethodDefinition = {
  code: string;
  name: string;
  module: string;
  description: string;
};

export const NOTIFICATION_MAIL_METHODS: readonly NotificationMailMethodDefinition[] =
  [
    {
      code: 'sendPasswordResetEmail',
      name: 'Password reset email',
      module: 'auth',
      description: 'Send password reset instructions to the account owner.',
    },
    {
      code: 'sendPasswordChangedSuccessEmail',
      name: 'Password changed email',
      module: 'auth',
      description: 'Confirm that the account password was changed.',
    },
    {
      code: 'sendEmailVerification',
      name: 'Email verification email',
      module: 'auth',
      description: 'Send an account email verification link.',
    },
    {
      code: 'sendWelcomeEmailAfterVerification',
      name: 'Welcome email after verification',
      module: 'auth',
      description: 'Send the welcome email after account verification.',
    },
    {
      code: 'sendLeaveSubmittedNotification',
      name: 'Leave submitted notification',
      module: 'leave',
      description: 'Notify approvers about a submitted leave request.',
    },
    {
      code: 'sendLeaveApprovalRequiredNotification',
      name: 'Leave approval required notification',
      module: 'leave',
      description: 'Notify approvers that leave approval is required.',
    },
    {
      code: 'sendLeaveApprovedNotification',
      name: 'Leave approved notification',
      module: 'leave',
      description: 'Notify the employee that leave was approved.',
    },
    {
      code: 'sendLeaveRejectedNotification',
      name: 'Leave rejected notification',
      module: 'leave',
      description: 'Notify the employee that leave was rejected.',
    },
    {
      code: 'sendLeaveReturnedForCorrectionNotification',
      name: 'Leave correction required notification',
      module: 'leave',
      description: 'Notify the employee that leave needs correction.',
    },
    {
      code: 'sendLeaveCancelledNotification',
      name: 'Leave cancelled notification',
      module: 'leave',
      description: 'Notify approvers that leave was cancelled.',
    },
    {
      code: 'sendEmployeeMovementApprovalRequiredNotification',
      name: 'Employee movement approval required',
      module: 'employee-movement',
      description: 'Notify approvers that an employee movement needs action.',
    },
    {
      code: 'sendEmployeeMovementApprovedNotification',
      name: 'Employee movement approved notification',
      module: 'employee-movement',
      description: 'Notify the employee that movement was approved.',
    },
    {
      code: 'sendEmployeeMovementRejectedNotification',
      name: 'Employee movement rejected notification',
      module: 'employee-movement',
      description: 'Notify the employee that movement was rejected.',
    },
    {
      code: 'sendEmployeeMovementAppliedNotification',
      name: 'Employee movement applied notification',
      module: 'employee-movement',
      description: 'Notify the employee that movement has taken effect.',
    },
    {
      code: 'sendOnboardingSubmittedToEmployee',
      name: 'Onboarding submitted to employee',
      module: 'onboarding',
      description: 'Notify the employee that onboarding started.',
    },
    {
      code: 'sendOnboardingSubmittedToApprover',
      name: 'Onboarding submitted to approver',
      module: 'onboarding',
      description: 'Notify approvers about a submitted onboarding request.',
    },
    {
      code: 'sendOnboardingApprovalRequiredNotification',
      name: 'Onboarding approval required',
      module: 'onboarding',
      description: 'Notify approvers that onboarding approval is required.',
    },
    {
      code: 'sendOnboardingApprovedNotification',
      name: 'Onboarding approved notification',
      module: 'onboarding',
      description: 'Notify recipients that onboarding was approved.',
    },
    {
      code: 'sendOnboardingRejectedNotification',
      name: 'Onboarding rejected notification',
      module: 'onboarding',
      description: 'Notify the employee that onboarding was rejected.',
    },
    {
      code: 'sendOnboardingTaskAssignedNotification',
      name: 'Onboarding task assigned',
      module: 'onboarding',
      description: 'Notify assignees about onboarding tasks.',
    },
    {
      code: 'sendOnboardingCompletedNotification',
      name: 'Onboarding completed notification',
      module: 'onboarding',
      description: 'Notify recipients that onboarding is complete.',
    },
    {
      code: 'sendOffboardingSubmittedToEmployee',
      name: 'Offboarding submitted to employee',
      module: 'offboarding',
      description: 'Notify the employee that offboarding started.',
    },
    {
      code: 'sendOffboardingSubmittedToApprover',
      name: 'Offboarding submitted to approver',
      module: 'offboarding',
      description: 'Notify approvers about a submitted offboarding request.',
    },
    {
      code: 'sendOffboardingApprovalRequiredNotification',
      name: 'Offboarding approval required',
      module: 'offboarding',
      description: 'Notify approvers that offboarding approval is required.',
    },
    {
      code: 'sendOffboardingApprovedNotification',
      name: 'Offboarding approved notification',
      module: 'offboarding',
      description: 'Notify recipients that offboarding was approved.',
    },
    {
      code: 'sendOffboardingRejectedNotification',
      name: 'Offboarding rejected notification',
      module: 'offboarding',
      description:
        'Notify an employee that their offboarding request was declined.',
    },
    {
      code: 'sendOffboardingTaskAssignedNotification',
      name: 'Offboarding task assigned',
      module: 'offboarding',
      description: 'Notify assignees about offboarding tasks.',
    },
    {
      code: 'sendOffboardingTaskOverdueNotification',
      name: 'Offboarding task overdue',
      module: 'offboarding',
      description: 'Notify assignees that offboarding tasks are overdue.',
    },
    {
      code: 'sendOffboardingApprovalReminderNotification',
      name: 'Offboarding approval reminder',
      module: 'offboarding',
      description: 'Send reminders for pending offboarding approvals.',
    },
    {
      code: 'sendOffboardingClearanceRequiredNotification',
      name: 'Offboarding clearance required',
      module: 'offboarding',
      description: 'Notify owners that offboarding clearance is required.',
    },
    {
      code: 'sendOffboardingClearanceOverdueNotification',
      name: 'Offboarding clearance overdue',
      module: 'offboarding',
      description: 'Notify owners that offboarding clearance is overdue.',
    },
    {
      code: 'sendOffboardingAssetOverdueNotification',
      name: 'Offboarding asset overdue',
      module: 'offboarding',
      description: 'Notify owners that asset return is overdue.',
    },
    {
      code: 'sendOffboardingSettlementOverdueNotification',
      name: 'Offboarding settlement overdue',
      module: 'offboarding',
      description: 'Notify owners that settlement is overdue.',
    },
    {
      code: 'sendOffboardingCompletedNotification',
      name: 'Offboarding completed notification',
      module: 'offboarding',
      description: 'Notify recipients that offboarding is complete.',
    },
  ] as const;

export const ALLOWED_NOTIFICATION_MAIL_METHODS = new Set(
  NOTIFICATION_MAIL_METHODS.map((item) => item.code),
);
