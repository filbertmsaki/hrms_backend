import { Injectable } from '@nestjs/common';
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
  OffboardingClearanceOverdueEvent,
  OffboardingClearanceRequiredEvent,
  OffboardingCompletedEvent,
  OffboardingSubmittedEvent,
  OffboardingTaskAssignedEvent,
  OffboardingTaskOverdueEvent,
  OnboardingApprovalRequiredEvent,
  OnboardingApprovedEvent,
  OnboardingCompletedEvent,
  OnboardingRejectedEvent,
  OnboardingSubmittedEvent,
  OnboardingTaskAssignedEvent,
} from '../hr/notifications/events';
import type { SafeSendMailOptions } from './mail-recipient-safety.util';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async sendPasswordResetEmail(
    to: string,
    name: string,
    resetLink: string,
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    try {
      await this.sendMail(
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
      console.error('Failed to send welcome email:', error);
    }
  }

  async sendLeaveSubmittedNotification(
    to: string,
    approverName: string,
    event: LeaveSubmittedEvent,
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
      {
        to,
        subject: `Leave Request Cancelled - ${event.employeeName}`,
        template: 'hr-leave-cancelled',
        context: { ...this.baseCtx(), approverName, ...event },
      },
      'HrNotificationListener.sendLeaveCancelledNotification',
    );
  }

  async sendOnboardingSubmittedToEmployee(
    to: string,
    event: OnboardingSubmittedEvent,
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
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
  ): Promise<void> {
    await this.sendMail(
      {
        to,
        subject: `Overdue Offboarding Clearance - ${event.clearanceType}`,
        template: 'hr-offboarding-clearance-overdue',
        context: { ...this.baseCtx(), ...event },
      },
      'HrNotificationListener.sendOffboardingClearanceOverdueNotification',
    );
  }

  async sendOffboardingCompletedNotification(
    to: string,
    recipientName: string,
    event: OffboardingCompletedEvent,
  ): Promise<void> {
    await this.sendMail(
      {
        to,
        subject: `Offboarding Completed - ${event.employeeName}`,
        template: 'hr-offboarding-completed',
        context: { ...this.baseCtx(), recipientName, ...event },
      },
      'HrNotificationListener.sendOffboardingCompletedNotification',
    );
  }

  private async sendMail(
    options: ISendMailOptions,
    sourceModule: string,
  ): Promise<void> {
    const safeOptions: SafeSendMailOptions = {
      ...(options as SafeSendMailOptions),
      mailSafetyContext: {
        sourceModule,
      },
    };

    await this.mailerService.sendMail(safeOptions as ISendMailOptions);
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
