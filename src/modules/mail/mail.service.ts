import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import type { ISendMailOptions } from '@nestjs-modules/mailer';
import {
  LeaveCancelledEvent,
  LeaveApprovalRequiredEvent,
  LeaveApprovedEvent,
  LeaveRejectedEvent,
  LeaveReturnedForCorrectionEvent,
  LeaveSubmittedEvent,
  OffboardingApprovalReminderEvent,
  OffboardingApprovalRequiredEvent,
  OffboardingApprovedEvent,
  OffboardingAssetOverdueEvent,
  OffboardingClearanceOverdueEvent,
  OffboardingClearanceRequiredEvent,
  OffboardingCompletedEvent,
  OffboardingSettlementOverdueEvent,
  OffboardingSubmittedEvent,
  OffboardingTaskAssignedEvent,
  OffboardingTaskOverdueEvent,
  OnboardingApprovalRequiredEvent,
  OnboardingApprovedEvent,
  OnboardingCompletedEvent,
  OnboardingRejectedEvent,
  OnboardingSubmittedEvent,
  OnboardingTaskAssignedEvent,
  EmployeeMovementApprovalRequiredEvent,
  EmployeeMovementApprovedEvent,
  EmployeeMovementRejectedEvent,
  EmployeeMovementAppliedEvent,
} from '../hr/notifications/events';
import type { SafeSendMailOptions } from './mail-recipient-safety.util';
import type { MailSendResult } from './mail-send-result.interface';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendPasswordResetEmail(
    to: string,
    name: string,
    resetLink: string,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: 'Reset Your Password',
        template: 'forgot-password',
        context: {
          name: name || 'User',
          resetLink,
          appName: this.configService.get<string>('APP_NAME') ?? 'Your App',
          year: new Date().getFullYear(),
        },
      },
      'Auth.sendPasswordResetEmail',
    );
  }

  async sendPasswordChangedSuccessEmail(
    to: string,
    name: string,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: 'Your Password Has Been Changed',
        template: 'password-changed',
        context: {
          name: name || 'User',
          changedAt: new Date().toLocaleString(),
          appName: this.configService.get<string>('APP_NAME') ?? 'Your App',
          year: new Date().getFullYear(),
        },
      },
      'Auth.sendPasswordChangedSuccessEmail',
    );
  }

  async sendEmailVerification(
    to: string,
    name: string,
    verificationLink: string,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: 'Verify Your Email Address',
        template: 'verification-email',
        context: {
          name: name || 'User',
          verificationLink,
          appName: this.configService.get<string>('APP_NAME') ?? 'Your App',
          supportEmail:
            this.configService.get<string>('SUPPORT_EMAIL') ??
            'support@yourapp.co.tz',
          year: new Date().getFullYear(),
        },
      },
      'Auth.sendEmailVerification',
    );
  }

  async sendWelcomeEmailAfterVerification(
    to: string,
    name: string,
  ): Promise<MailSendResult> {
    try {
      return await this.sendMail(
        {
          to,
          subject: 'Welcome to Your App!',
          template: 'welcome-after-verification',
          context: {
            name: name || 'User',
            appName: this.configService.get<string>('APP_NAME') ?? 'Your App',
            year: new Date().getFullYear(),
            loginUrl: `${
              this.configService.get<string>('APP_FRONTEND_URL') ??
              'http://localhost:5173'
            }/login`,
            supportEmail:
              this.configService.get<string>('SUPPORT_EMAIL') ??
              'support@yourdomain.com',
          },
        },
        'Auth.sendWelcomeEmailAfterVerification',
      );
    } catch (error) {
      this.logger.error(
        'Failed to send welcome email after verification',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async sendLeaveSubmittedNotification(
    to: string,
    approverName: string,
    event: LeaveSubmittedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Leave Request Pending Your Approval - ${event.employeeName}`,
        template: 'hr-leave-submitted',
        context: { ...this.baseCtx(), approverName, ...event },
      },
      'HrNotificationListener.sendLeaveSubmittedNotification',
    );
  }

  async sendLeaveApprovalRequiredNotification(
    to: string,
    approverName: string,
    event: LeaveApprovalRequiredEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Action Required: Leave Approval for ${event.employeeName}`,
        template: 'hr-leave-approval-required',
        context: { ...this.baseCtx(), approverName, ...event },
      },
      'HrNotificationListener.sendLeaveApprovalRequiredNotification',
    );
  }

  async sendLeaveApprovedNotification(
    to: string,
    event: LeaveApprovedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: 'Your Leave Request Has Been Approved',
        template: 'hr-leave-approved',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendLeaveApprovedNotification',
    );
  }

  async sendLeaveRejectedNotification(
    to: string,
    event: LeaveRejectedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: 'Your Leave Request Was Not Approved',
        template: 'hr-leave-rejected',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendLeaveRejectedNotification',
    );
  }

  async sendLeaveReturnedForCorrectionNotification(
    to: string,
    event: LeaveReturnedForCorrectionEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: 'Your Leave Request Needs Correction',
        template: 'hr-leave-returned-for-correction',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendLeaveReturnedForCorrectionNotification',
    );
  }

  async sendLeaveCancelledNotification(
    to: string,
    approverName: string,
    event: LeaveCancelledEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Leave Request Cancelled - ${event.employeeName}`,
        template: 'hr-leave-cancelled',
        context: { ...this.baseCtx(), approverName, ...event },
      },
      'HrNotificationListener.sendLeaveCancelledNotification',
    );
  }

  async sendEmployeeMovementApprovalRequiredNotification(
    to: string,
    approverName: string,
    event: EmployeeMovementApprovalRequiredEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Action Required: Movement Approval for ${event.employeeName}`,
        template: 'hr-employee-movement-approval-required',
        context: { ...this.baseCtx(), approverName, ...event },
      },
      'HrNotificationListener.sendEmployeeMovementApprovalRequiredNotification',
    );
  }

  async sendEmployeeMovementApprovedNotification(
    to: string,
    event: EmployeeMovementApprovedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Your Movement Request Has Been Approved - ${event.movementNo}`,
        template: 'hr-employee-movement-approved',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendEmployeeMovementApprovedNotification',
    );
  }

  async sendEmployeeMovementRejectedNotification(
    to: string,
    event: EmployeeMovementRejectedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Your Movement Request Was Not Approved - ${event.movementNo}`,
        template: 'hr-employee-movement-rejected',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendEmployeeMovementRejectedNotification',
    );
  }

  async sendEmployeeMovementAppliedNotification(
    to: string,
    event: EmployeeMovementAppliedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Your Movement Has Taken Effect - ${event.movementNo}`,
        template: 'hr-employee-movement-applied',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendEmployeeMovementAppliedNotification',
    );
  }

  async sendOnboardingSubmittedToEmployee(
    to: string,
    event: OnboardingSubmittedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: 'Your Onboarding Has Started',
        template: 'hr-onboarding-submitted-employee',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOnboardingSubmittedToEmployee',
    );
  }

  async sendOnboardingSubmittedToApprover(
    to: string,
    approverName: string,
    event: OnboardingSubmittedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Onboarding Approval Required - ${event.employeeName}`,
        template: 'hr-onboarding-submitted-approver',
        context: { ...this.baseCtx(), approverName, ...event },
      },
      'HrNotificationListener.sendOnboardingSubmittedToApprover',
    );
  }

  async sendOnboardingApprovalRequiredNotification(
    to: string,
    approverName: string,
    event: OnboardingApprovalRequiredEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Action Required: Onboarding Approval for ${event.employeeName}`,
        template: 'hr-onboarding-approval-required',
        context: { ...this.baseCtx(), approverName, ...event },
      },
      'HrNotificationListener.sendOnboardingApprovalRequiredNotification',
    );
  }

  async sendOnboardingApprovedNotification(
    to: string,
    recipientName: string,
    event: OnboardingApprovedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Onboarding Approved - ${event.employeeName}`,
        template: 'hr-onboarding-approved',
        context: { ...this.baseCtx(), recipientName, ...event },
      },
      'HrNotificationListener.sendOnboardingApprovedNotification',
    );
  }

  async sendOnboardingRejectedNotification(
    to: string,
    event: OnboardingRejectedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: 'Your Onboarding Request Was Not Approved',
        template: 'hr-onboarding-rejected',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOnboardingRejectedNotification',
    );
  }

  async sendOnboardingTaskAssignedNotification(
    to: string,
    event: OnboardingTaskAssignedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `New Onboarding Task Assigned - ${event.taskTitle}`,
        template: 'hr-onboarding-task-assigned',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOnboardingTaskAssignedNotification',
    );
  }

  async sendOnboardingCompletedNotification(
    to: string,
    recipientName: string,
    event: OnboardingCompletedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Onboarding Complete - ${event.employeeName}`,
        template: 'hr-onboarding-completed',
        context: { ...this.baseCtx(), recipientName, ...event },
      },
      'HrNotificationListener.sendOnboardingCompletedNotification',
    );
  }

  async sendOffboardingSubmittedToEmployee(
    to: string,
    event: OffboardingSubmittedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: 'Your Offboarding Process Has Started',
        template: 'hr-offboarding-submitted-employee',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOffboardingSubmittedToEmployee',
    );
  }

  async sendOffboardingSubmittedToApprover(
    to: string,
    approverName: string,
    event: OffboardingSubmittedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Offboarding Approval Required - ${event.employeeName}`,
        template: 'hr-offboarding-submitted-approver',
        context: { ...this.baseCtx(), approverName, ...event },
      },
      'HrNotificationListener.sendOffboardingSubmittedToApprover',
    );
  }

  async sendOffboardingApprovalRequiredNotification(
    to: string,
    approverName: string,
    event: OffboardingApprovalRequiredEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Action Required: Offboarding Approval for ${event.employeeName}`,
        template: 'hr-offboarding-approval-required',
        context: { ...this.baseCtx(), approverName, ...event },
      },
      'HrNotificationListener.sendOffboardingApprovalRequiredNotification',
    );
  }

  async sendOffboardingApprovedNotification(
    to: string,
    recipientName: string,
    event: OffboardingApprovedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Offboarding Approved - ${event.employeeName}`,
        template: 'hr-offboarding-approved',
        context: { ...this.baseCtx(), recipientName, ...event },
      },
      'HrNotificationListener.sendOffboardingApprovedNotification',
    );
  }

  async sendOffboardingTaskAssignedNotification(
    to: string,
    event: OffboardingTaskAssignedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `New Offboarding Task Assigned - ${event.taskTitle}`,
        template: 'hr-offboarding-task-assigned',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOffboardingTaskAssignedNotification',
    );
  }

  async sendOffboardingTaskOverdueNotification(
    to: string,
    event: OffboardingTaskOverdueEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Overdue Offboarding Task - ${event.taskTitle}`,
        template: 'hr-offboarding-task-overdue',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOffboardingTaskOverdueNotification',
    );
  }

  async sendOffboardingApprovalReminderNotification(
    to: string,
    event: OffboardingApprovalReminderEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Offboarding Approval Reminder - ${event.employeeName}`,
        template: 'hr-offboarding-approval-reminder',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOffboardingApprovalReminderNotification',
    );
  }

  async sendOffboardingClearanceRequiredNotification(
    to: string,
    event: OffboardingClearanceRequiredEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Clearance Required: ${event.clearanceType} - ${event.employeeName}`,
        template: 'hr-offboarding-clearance-required',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOffboardingClearanceRequiredNotification',
    );
  }

  async sendOffboardingClearanceOverdueNotification(
    to: string,
    event: OffboardingClearanceOverdueEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Overdue Offboarding Clearance - ${event.clearanceType}`,
        template: 'hr-offboarding-clearance-overdue',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOffboardingClearanceOverdueNotification',
    );
  }

  async sendOffboardingAssetOverdueNotification(
    to: string,
    event: OffboardingAssetOverdueEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Overdue Offboarding Asset Return - ${event.assetLabel}`,
        template: 'hr-offboarding-asset-overdue',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOffboardingAssetOverdueNotification',
    );
  }

  async sendOffboardingSettlementOverdueNotification(
    to: string,
    event: OffboardingSettlementOverdueEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Overdue Offboarding Settlement - ${event.settlementTitle}`,
        template: 'hr-offboarding-settlement-overdue',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOffboardingSettlementOverdueNotification',
    );
  }

  async sendOffboardingCompletedNotification(
    to: string,
    recipientName: string,
    event: OffboardingCompletedEvent,
  ): Promise<MailSendResult> {
    return this.sendMail(
      {
        to,
        subject: `Offboarding Completed - ${event.employeeName}`,
        template: 'hr-offboarding-completed',
        context: { ...this.baseCtx(), recipientName, ...event },
      },
      'HrNotificationListener.sendOffboardingCompletedNotification',
    );
  }

  /**
   * Generic email channel for the notification-delivery pipeline. Unlike the
   * templated senders above, this has no fixed HR event shape — callers
   * supply their own subject/message/action link.
   */
  async sendGenericNotificationEmail(
    to: string,
    subject: string,
    message: string,
    actionUrl?: string | null,
  ): Promise<MailSendResult> {
    const safeOptions: SafeSendMailOptions = {
      to,
      subject,
      html: `<p>${message}</p>${
        actionUrl ? `<p><a href="${actionUrl}">View details</a></p>` : ''
      }`,
      text: actionUrl ? `${message}\n\n${actionUrl}` : message,
      mailSafetyContext: {
        sourceModule: 'Notifications.sendGenericNotificationEmail',
      },
    };

    const result = (await this.mailerService.sendMail(
      safeOptions as ISendMailOptions,
    )) as { messageId?: string; response?: string } | undefined;

    return {
      messageId: result?.messageId ?? null,
      response: result?.response ?? null,
    };
  }

  private async sendMail(
    options: ISendMailOptions,
    sourceModule: string,
  ): Promise<MailSendResult> {
    const safeOptions: SafeSendMailOptions = {
      ...(options as SafeSendMailOptions),
      mailSafetyContext: {
        sourceModule,
      },
    };

    const result = (await this.mailerService.sendMail(
      safeOptions as ISendMailOptions,
    )) as { messageId?: string; response?: string } | undefined;

    if (result?.messageId || result?.response) {
      this.logger.log(
        `Email sent via ${sourceModule}. Message ID: ${result.messageId ?? 'n/a'}. Provider response: ${result.response ?? 'n/a'}.`,
      );
    }

    return {
      messageId: result?.messageId ?? null,
      response: result?.response ?? null,
    };
  }

  private baseCtx() {
    return {
      appName: this.configService.get<string>('APP_NAME') ?? 'HRMS',
      supportEmail:
        this.configService.get<string>('SUPPORT_EMAIL') ??
        'support@alliance.co.tz',
      year: new Date().getFullYear(),
    };
  }
}
