import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import {
  LeaveCancelledEvent,
  LeaveApprovalRequiredEvent,
  LeaveApprovedEvent,
  LeaveRejectedEvent,
  LeaveReturnedForCorrectionEvent,
  LeaveSubmittedEvent,
  OnboardingApprovalRequiredEvent,
  OnboardingApprovedEvent,
  OnboardingCompletedEvent,
  OnboardingRejectedEvent,
  OnboardingSubmittedEvent,
  OnboardingTaskAssignedEvent,
  OffboardingApprovalRequiredEvent,
  OffboardingApprovedEvent,
  OffboardingClearanceRequiredEvent,
  OffboardingCompletedEvent,
  OffboardingSubmittedEvent,
  OffboardingTaskAssignedEvent,
} from '../hr/notifications/events';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send password reset email with link
   */
  async sendPasswordResetEmail(to: string, name: string, resetLink: string) {
    await this.mailerService.sendMail({
      to,
      subject: 'Reset Your Password',
      template: 'forgot-password',
      context: {
        name: name || 'User',
        resetLink,
        appName: this.configService.get<string>('APP_NAME') ?? 'Your App',
        year: new Date().getFullYear(),
      },
    });
  }

  /**
   * Send success notification after password change
   */
  async sendPasswordChangedSuccessEmail(to: string, name: string) {
    await this.mailerService.sendMail({
      to,
      subject: 'Your Password Has Been Changed',
      template: 'password-changed',
      context: {
        name: name || 'User',
        changedAt: new Date().toLocaleString(),
        appName: this.configService.get<string>('APP_NAME') ?? 'Your App',
        year: new Date().getFullYear(),
      },
    });
  }

  async sendEmailVerification(
    to: string,
    name: string,
    verificationLink: string,
  ): Promise<void> {
    await this.mailerService.sendMail({
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
    });
  }

  /**
   * Send welcome email after successful email verification
   */
  async sendWelcomeEmailAfterVerification(
    to: string,
    name: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
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
      });
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }
  }

  // ── LEAVE NOTIFICATIONS ────────────────────────────────────────────────────

  async sendLeaveSubmittedNotification(
    to: string,
    approverName: string,
    event: LeaveSubmittedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Leave Request Pending Your Approval — ${event.employeeName}`,
      template: 'hr-leave-submitted',
      context: { ...this.baseCtx(), approverName, ...event },
    });
  }

  async sendLeaveApprovalRequiredNotification(
    to: string,
    approverName: string,
    event: LeaveApprovalRequiredEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Action Required: Leave Approval for ${event.employeeName}`,
      template: 'hr-leave-approval-required',
      context: { ...this.baseCtx(), approverName, ...event },
    });
  }

  async sendLeaveApprovedNotification(
    to: string,
    event: LeaveApprovedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Your Leave Request Has Been Approved`,
      template: 'hr-leave-approved',
      context: { ...this.baseCtx(), ...event },
    });
  }

  async sendLeaveRejectedNotification(
    to: string,
    event: LeaveRejectedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Your Leave Request Was Not Approved`,
      template: 'hr-leave-rejected',
      context: { ...this.baseCtx(), ...event },
    });
  }

  async sendLeaveReturnedForCorrectionNotification(
    to: string,
    event: LeaveReturnedForCorrectionEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Your Leave Request Needs Correction`,
      template: 'hr-leave-returned-for-correction',
      context: { ...this.baseCtx(), ...event },
    });
  }

  async sendLeaveCancelledNotification(
    to: string,
    approverName: string,
    event: LeaveCancelledEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Leave Request Cancelled — ${event.employeeName}`,
      template: 'hr-leave-cancelled',
      context: { ...this.baseCtx(), approverName, ...event },
    });
  }

  // ── ONBOARDING NOTIFICATIONS ───────────────────────────────────────────────

  async sendOnboardingSubmittedToEmployee(
    to: string,
    event: OnboardingSubmittedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Your Onboarding Has Started`,
      template: 'hr-onboarding-submitted-employee',
      context: { ...this.baseCtx(), ...event },
    });
  }

  async sendOnboardingSubmittedToApprover(
    to: string,
    approverName: string,
    event: OnboardingSubmittedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Onboarding Approval Required — ${event.employeeName}`,
      template: 'hr-onboarding-submitted-approver',
      context: { ...this.baseCtx(), approverName, ...event },
    });
  }

  async sendOnboardingApprovalRequiredNotification(
    to: string,
    approverName: string,
    event: OnboardingApprovalRequiredEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Action Required: Onboarding Approval for ${event.employeeName}`,
      template: 'hr-onboarding-approval-required',
      context: { ...this.baseCtx(), approverName, ...event },
    });
  }

  async sendOnboardingApprovedNotification(
    to: string,
    recipientName: string,
    event: OnboardingApprovedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Onboarding Approved — ${event.employeeName}`,
      template: 'hr-onboarding-approved',
      context: { ...this.baseCtx(), recipientName, ...event },
    });
  }

  async sendOnboardingRejectedNotification(
    to: string,
    event: OnboardingRejectedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Your Onboarding Request Was Not Approved`,
      template: 'hr-onboarding-rejected',
      context: { ...this.baseCtx(), ...event },
    });
  }

  async sendOnboardingTaskAssignedNotification(
    to: string,
    event: OnboardingTaskAssignedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `New Onboarding Task Assigned — ${event.taskTitle}`,
      template: 'hr-onboarding-task-assigned',
      context: { ...this.baseCtx(), ...event },
    });
  }

  async sendOnboardingCompletedNotification(
    to: string,
    recipientName: string,
    event: OnboardingCompletedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Onboarding Complete — ${event.employeeName}`,
      template: 'hr-onboarding-completed',
      context: { ...this.baseCtx(), recipientName, ...event },
    });
  }

  // ── OFFBOARDING NOTIFICATIONS ──────────────────────────────────────────────

  async sendOffboardingSubmittedToEmployee(
    to: string,
    event: OffboardingSubmittedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Your Offboarding Process Has Started`,
      template: 'hr-offboarding-submitted-employee',
      context: { ...this.baseCtx(), ...event },
    });
  }

  async sendOffboardingSubmittedToApprover(
    to: string,
    approverName: string,
    event: OffboardingSubmittedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Offboarding Approval Required — ${event.employeeName}`,
      template: 'hr-offboarding-submitted-approver',
      context: { ...this.baseCtx(), approverName, ...event },
    });
  }

  async sendOffboardingApprovalRequiredNotification(
    to: string,
    approverName: string,
    event: OffboardingApprovalRequiredEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Action Required: Offboarding Approval for ${event.employeeName}`,
      template: 'hr-offboarding-approval-required',
      context: { ...this.baseCtx(), approverName, ...event },
    });
  }

  async sendOffboardingApprovedNotification(
    to: string,
    recipientName: string,
    event: OffboardingApprovedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Offboarding Approved — ${event.employeeName}`,
      template: 'hr-offboarding-approved',
      context: { ...this.baseCtx(), recipientName, ...event },
    });
  }

  async sendOffboardingTaskAssignedNotification(
    to: string,
    event: OffboardingTaskAssignedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `New Offboarding Task Assigned — ${event.taskTitle}`,
      template: 'hr-offboarding-task-assigned',
      context: { ...this.baseCtx(), ...event },
    });
  }

  async sendOffboardingClearanceRequiredNotification(
    to: string,
    event: OffboardingClearanceRequiredEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Clearance Required: ${event.clearanceType} — ${event.employeeName}`,
      template: 'hr-offboarding-clearance-required',
      context: { ...this.baseCtx(), ...event },
    });
  }

  async sendOffboardingCompletedNotification(
    to: string,
    recipientName: string,
    event: OffboardingCompletedEvent,
  ): Promise<void> {
    await this.mailerService.sendMail({
      to,
      subject: `Offboarding Completed — ${event.employeeName}`,
      template: 'hr-offboarding-completed',
      context: { ...this.baseCtx(), recipientName, ...event },
    });
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────

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
