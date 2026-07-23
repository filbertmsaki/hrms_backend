import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../../mail/mail.service';
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
  OffboardingApprovalReminderEvent,
  OffboardingApprovedEvent,
  OffboardingClearanceOverdueEvent,
  OffboardingClearanceRequiredEvent,
  OffboardingCompletedEvent,
  OffboardingSubmittedEvent,
  OffboardingTaskAssignedEvent,
  OffboardingTaskOverdueEvent,
} from './events';

@Injectable()
export class HrNotificationListener {
  private readonly logger = new Logger(HrNotificationListener.name);

  constructor(private readonly mailService: MailService) {}

  // ── LEAVE ──────────────────────────────────────────────────────────────────

  @OnEvent(LeaveSubmittedEvent.EVENT)
  async onLeaveSubmitted(event: LeaveSubmittedEvent): Promise<void> {
    for (const approver of event.approvers) {
      await this.send(() =>
        this.mailService.sendLeaveSubmittedNotification(
          approver.email,
          approver.name,
          event,
        ),
      );
    }
  }

  @OnEvent(LeaveApprovalRequiredEvent.EVENT)
  async onLeaveApprovalRequired(
    event: LeaveApprovalRequiredEvent,
  ): Promise<void> {
    for (const approver of event.approvers) {
      await this.send(() =>
        this.mailService.sendLeaveApprovalRequiredNotification(
          approver.email,
          approver.name,
          event,
        ),
      );
    }
  }

  @OnEvent(LeaveApprovedEvent.EVENT)
  async onLeaveApproved(event: LeaveApprovedEvent): Promise<void> {
    await this.send(() =>
      this.mailService.sendLeaveApprovedNotification(
        event.employeeEmail,
        event,
      ),
    );
  }

  @OnEvent(LeaveRejectedEvent.EVENT)
  async onLeaveRejected(event: LeaveRejectedEvent): Promise<void> {
    await this.send(() =>
      this.mailService.sendLeaveRejectedNotification(
        event.employeeEmail,
        event,
      ),
    );
  }

  @OnEvent(LeaveReturnedForCorrectionEvent.EVENT)
  async onLeaveReturnedForCorrection(
    event: LeaveReturnedForCorrectionEvent,
  ): Promise<void> {
    await this.send(() =>
      this.mailService.sendLeaveReturnedForCorrectionNotification(
        event.employeeEmail,
        event,
      ),
    );
  }

  @OnEvent(LeaveCancelledEvent.EVENT)
  async onLeaveCancelled(event: LeaveCancelledEvent): Promise<void> {
    for (const approver of event.pendingApprovers) {
      await this.send(() =>
        this.mailService.sendLeaveCancelledNotification(
          approver.email,
          approver.name,
          event,
        ),
      );
    }
  }

  // ── ONBOARDING ─────────────────────────────────────────────────────────────

  @OnEvent(OnboardingSubmittedEvent.EVENT)
  async onOnboardingSubmitted(event: OnboardingSubmittedEvent): Promise<void> {
    await this.send(() =>
      this.mailService.sendOnboardingSubmittedToEmployee(
        event.employeeEmail,
        event,
      ),
    );
    for (const approver of event.approvers) {
      await this.send(() =>
        this.mailService.sendOnboardingSubmittedToApprover(
          approver.email,
          approver.name,
          event,
        ),
      );
    }
  }

  @OnEvent(OnboardingApprovalRequiredEvent.EVENT)
  async onOnboardingApprovalRequired(
    event: OnboardingApprovalRequiredEvent,
  ): Promise<void> {
    for (const approver of event.approvers) {
      await this.send(() =>
        this.mailService.sendOnboardingApprovalRequiredNotification(
          approver.email,
          approver.name,
          event,
        ),
      );
    }
  }

  @OnEvent(OnboardingApprovedEvent.EVENT)
  async onOnboardingApproved(event: OnboardingApprovedEvent): Promise<void> {
    await this.send(() =>
      this.mailService.sendOnboardingApprovedNotification(
        event.employeeEmail,
        event.employeeName,
        event,
      ),
    );
    for (const hr of event.hrRecipients) {
      await this.send(() =>
        this.mailService.sendOnboardingApprovedNotification(
          hr.email,
          hr.name,
          event,
        ),
      );
    }
  }

  @OnEvent(OnboardingRejectedEvent.EVENT)
  async onOnboardingRejected(event: OnboardingRejectedEvent): Promise<void> {
    await this.send(() =>
      this.mailService.sendOnboardingRejectedNotification(
        event.employeeEmail,
        event,
      ),
    );
  }

  @OnEvent(OnboardingTaskAssignedEvent.EVENT)
  async onOnboardingTaskAssigned(
    event: OnboardingTaskAssignedEvent,
  ): Promise<void> {
    await this.send(() =>
      this.mailService.sendOnboardingTaskAssignedNotification(
        event.assigneeEmail,
        event,
      ),
    );
  }

  @OnEvent(OnboardingCompletedEvent.EVENT)
  async onOnboardingCompleted(event: OnboardingCompletedEvent): Promise<void> {
    await this.send(() =>
      this.mailService.sendOnboardingCompletedNotification(
        event.employeeEmail,
        event.employeeName,
        event,
      ),
    );
    if (event.managerEmail && event.managerName) {
      await this.send(() =>
        this.mailService.sendOnboardingCompletedNotification(
          event.managerEmail!,
          event.managerName!,
          event,
        ),
      );
    }
  }

  // ── OFFBOARDING ────────────────────────────────────────────────────────────

  @OnEvent(OffboardingSubmittedEvent.EVENT)
  async onOffboardingSubmitted(
    event: OffboardingSubmittedEvent,
  ): Promise<void> {
    await this.send(() =>
      this.mailService.sendOffboardingSubmittedToEmployee(
        event.employeeEmail,
        event,
      ),
    );
    for (const approver of event.approvers) {
      await this.send(() =>
        this.mailService.sendOffboardingSubmittedToApprover(
          approver.email,
          approver.name,
          event,
        ),
      );
    }
  }

  @OnEvent(OffboardingApprovalRequiredEvent.EVENT)
  async onOffboardingApprovalRequired(
    event: OffboardingApprovalRequiredEvent,
  ): Promise<void> {
    for (const approver of event.approvers) {
      await this.send(() =>
        this.mailService.sendOffboardingApprovalRequiredNotification(
          approver.email,
          approver.name,
          event,
        ),
      );
    }
  }

  @OnEvent(OffboardingApprovedEvent.EVENT)
  async onOffboardingApproved(event: OffboardingApprovedEvent): Promise<void> {
    await this.send(() =>
      this.mailService.sendOffboardingApprovedNotification(
        event.employeeEmail,
        event.employeeName,
        event,
      ),
    );
    for (const hr of event.hrRecipients) {
      await this.send(() =>
        this.mailService.sendOffboardingApprovedNotification(
          hr.email,
          hr.name,
          event,
        ),
      );
    }
  }

  @OnEvent(OffboardingTaskAssignedEvent.EVENT)
  async onOffboardingTaskAssigned(
    event: OffboardingTaskAssignedEvent,
  ): Promise<void> {
    await this.send(() =>
      this.mailService.sendOffboardingTaskAssignedNotification(
        event.assigneeEmail,
        event,
      ),
    );
  }

  @OnEvent(OffboardingTaskOverdueEvent.EVENT)
  async onOffboardingTaskOverdue(
    event: OffboardingTaskOverdueEvent,
  ): Promise<void> {
    if (!event.assigneeEmail) {
      return;
    }

    await this.send(() =>
      this.mailService.sendOffboardingTaskOverdueNotification(
        event.assigneeEmail!,
        event,
      ),
    );
  }

  @OnEvent(OffboardingApprovalReminderEvent.EVENT)
  async onOffboardingApprovalReminder(
    event: OffboardingApprovalReminderEvent,
  ): Promise<void> {
    if (!event.approverEmail) {
      return;
    }

    await this.send(() =>
      this.mailService.sendOffboardingApprovalReminderNotification(
        event.approverEmail!,
        event,
      ),
    );
  }

  @OnEvent(OffboardingClearanceRequiredEvent.EVENT)
  async onOffboardingClearanceRequired(
    event: OffboardingClearanceRequiredEvent,
  ): Promise<void> {
    await this.send(() =>
      this.mailService.sendOffboardingClearanceRequiredNotification(
        event.ownerEmail,
        event,
      ),
    );
  }

  @OnEvent(OffboardingClearanceOverdueEvent.EVENT)
  async onOffboardingClearanceOverdue(
    event: OffboardingClearanceOverdueEvent,
  ): Promise<void> {
    if (!event.ownerEmail) {
      return;
    }

    await this.send(() =>
      this.mailService.sendOffboardingClearanceOverdueNotification(
        event.ownerEmail!,
        event,
      ),
    );
  }

  @OnEvent(OffboardingCompletedEvent.EVENT)
  async onOffboardingCompleted(
    event: OffboardingCompletedEvent,
  ): Promise<void> {
    await this.send(() =>
      this.mailService.sendOffboardingCompletedNotification(
        event.employeeEmail,
        event.employeeName,
        event,
      ),
    );
    if (event.managerEmail && event.managerName) {
      await this.send(() =>
        this.mailService.sendOffboardingCompletedNotification(
          event.managerEmail!,
          event.managerName!,
          event,
        ),
      );
    }
    for (const hr of event.hrRecipients) {
      await this.send(() =>
        this.mailService.sendOffboardingCompletedNotification(
          hr.email,
          hr.name,
          event,
        ),
      );
    }
  }

  // ── GUARD ──────────────────────────────────────────────────────────────────

  private async send(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(
        'HR notification email failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
