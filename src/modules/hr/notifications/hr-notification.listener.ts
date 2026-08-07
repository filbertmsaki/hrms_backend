import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationQueueService } from '../../notifications/notification-queue.service';
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
  OffboardingAssetOverdueEvent,
  OffboardingClearanceOverdueEvent,
  OffboardingClearanceRequiredEvent,
  OffboardingCompletedEvent,
  OffboardingSettlementOverdueEvent,
  OffboardingSubmittedEvent,
  OffboardingTaskAssignedEvent,
  OffboardingTaskOverdueEvent,
  EmployeeMovementApprovalRequiredEvent,
  EmployeeMovementApprovedEvent,
  EmployeeMovementRejectedEvent,
  EmployeeMovementAppliedEvent,
} from './events';

@Injectable()
export class HrNotificationListener {
  private readonly logger = new Logger(HrNotificationListener.name);

  constructor(
    private readonly notificationQueueService: NotificationQueueService,
  ) {}

  // ── LEAVE ──────────────────────────────────────────────────────────────────

  @OnEvent(LeaveSubmittedEvent.EVENT)
  async onLeaveSubmitted(event: LeaveSubmittedEvent): Promise<void> {
    for (const approver of event.approvers) {
      await this.send(() =>
        this.notificationQueueService.enqueueMailMethod(
          'sendLeaveSubmittedNotification',
          [approver.email, approver.name, event],
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
        this.notificationQueueService.enqueueMailMethod(
          'sendLeaveApprovalRequiredNotification',
          [approver.email, approver.name, event],
        ),
      );
    }
  }

  @OnEvent(LeaveApprovedEvent.EVENT)
  async onLeaveApproved(event: LeaveApprovedEvent): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendLeaveApprovedNotification',
        [event.employeeEmail, event],
      ),
    );
  }

  @OnEvent(LeaveRejectedEvent.EVENT)
  async onLeaveRejected(event: LeaveRejectedEvent): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendLeaveRejectedNotification',
        [event.employeeEmail, event],
      ),
    );
  }

  @OnEvent(LeaveReturnedForCorrectionEvent.EVENT)
  async onLeaveReturnedForCorrection(
    event: LeaveReturnedForCorrectionEvent,
  ): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendLeaveReturnedForCorrectionNotification',
        [event.employeeEmail, event],
      ),
    );
  }

  @OnEvent(LeaveCancelledEvent.EVENT)
  async onLeaveCancelled(event: LeaveCancelledEvent): Promise<void> {
    for (const approver of event.pendingApprovers) {
      await this.send(() =>
        this.notificationQueueService.enqueueMailMethod(
          'sendLeaveCancelledNotification',
          [approver.email, approver.name, event],
        ),
      );
    }
  }

  // ── EMPLOYEE MOVEMENTS ──────────────────────────────────────────────────────

  @OnEvent(EmployeeMovementApprovalRequiredEvent.EVENT)
  async onEmployeeMovementApprovalRequired(
    event: EmployeeMovementApprovalRequiredEvent,
  ): Promise<void> {
    for (const approver of event.approvers) {
      await this.send(() =>
        this.notificationQueueService.enqueueMailMethod(
          'sendEmployeeMovementApprovalRequiredNotification',
          [approver.email, approver.name, event],
        ),
      );
    }
  }

  @OnEvent(EmployeeMovementApprovedEvent.EVENT)
  async onEmployeeMovementApproved(
    event: EmployeeMovementApprovedEvent,
  ): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendEmployeeMovementApprovedNotification',
        [event.employeeEmail, event],
      ),
    );
  }

  @OnEvent(EmployeeMovementRejectedEvent.EVENT)
  async onEmployeeMovementRejected(
    event: EmployeeMovementRejectedEvent,
  ): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendEmployeeMovementRejectedNotification',
        [event.employeeEmail, event],
      ),
    );
  }

  @OnEvent(EmployeeMovementAppliedEvent.EVENT)
  async onEmployeeMovementApplied(
    event: EmployeeMovementAppliedEvent,
  ): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendEmployeeMovementAppliedNotification',
        [event.employeeEmail, event],
      ),
    );
  }

  // ── ONBOARDING ─────────────────────────────────────────────────────────────

  @OnEvent(OnboardingSubmittedEvent.EVENT)
  async onOnboardingSubmitted(event: OnboardingSubmittedEvent): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOnboardingSubmittedToEmployee',
        [event.employeeEmail, event],
      ),
    );
    for (const approver of event.approvers) {
      await this.send(() =>
        this.notificationQueueService.enqueueMailMethod(
          'sendOnboardingSubmittedToApprover',
          [approver.email, approver.name, event],
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
        this.notificationQueueService.enqueueMailMethod(
          'sendOnboardingApprovalRequiredNotification',
          [approver.email, approver.name, event],
        ),
      );
    }
  }

  @OnEvent(OnboardingApprovedEvent.EVENT)
  async onOnboardingApproved(event: OnboardingApprovedEvent): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOnboardingApprovedNotification',
        [event.employeeEmail, event.employeeName, event],
      ),
    );
    for (const hr of event.hrRecipients) {
      await this.send(() =>
        this.notificationQueueService.enqueueMailMethod(
          'sendOnboardingApprovedNotification',
          [hr.email, hr.name, event],
        ),
      );
    }
  }

  @OnEvent(OnboardingRejectedEvent.EVENT)
  async onOnboardingRejected(event: OnboardingRejectedEvent): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOnboardingRejectedNotification',
        [event.employeeEmail, event],
      ),
    );
  }

  @OnEvent(OnboardingTaskAssignedEvent.EVENT)
  async onOnboardingTaskAssigned(
    event: OnboardingTaskAssignedEvent,
  ): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOnboardingTaskAssignedNotification',
        [event.assigneeEmail, event],
      ),
    );
  }

  @OnEvent(OnboardingCompletedEvent.EVENT)
  async onOnboardingCompleted(event: OnboardingCompletedEvent): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOnboardingCompletedNotification',
        [event.employeeEmail, event.employeeName, event],
      ),
    );
    if (event.managerEmail && event.managerName) {
      await this.send(() =>
        this.notificationQueueService.enqueueMailMethod(
          'sendOnboardingCompletedNotification',
          [event.managerEmail!, event.managerName!, event],
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
      this.notificationQueueService.enqueueMailMethod(
        'sendOffboardingSubmittedToEmployee',
        [event.employeeEmail, event],
      ),
    );
    for (const approver of event.approvers) {
      await this.send(() =>
        this.notificationQueueService.enqueueMailMethod(
          'sendOffboardingSubmittedToApprover',
          [approver.email, approver.name, event],
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
        this.notificationQueueService.enqueueMailMethod(
          'sendOffboardingApprovalRequiredNotification',
          [approver.email, approver.name, event],
        ),
      );
    }
  }

  @OnEvent(OffboardingApprovedEvent.EVENT)
  async onOffboardingApproved(event: OffboardingApprovedEvent): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOffboardingApprovedNotification',
        [event.employeeEmail, event.employeeName, event],
      ),
    );
    for (const hr of event.hrRecipients) {
      await this.send(() =>
        this.notificationQueueService.enqueueMailMethod(
          'sendOffboardingApprovedNotification',
          [hr.email, hr.name, event],
        ),
      );
    }
  }

  @OnEvent(OffboardingTaskAssignedEvent.EVENT)
  async onOffboardingTaskAssigned(
    event: OffboardingTaskAssignedEvent,
  ): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOffboardingTaskAssignedNotification',
        [event.assigneeEmail, event],
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
      this.notificationQueueService.enqueueMailMethod(
        'sendOffboardingTaskOverdueNotification',
        [event.assigneeEmail!, event],
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
      this.notificationQueueService.enqueueMailMethod(
        'sendOffboardingApprovalReminderNotification',
        [event.approverEmail!, event],
      ),
    );
  }

  @OnEvent(OffboardingClearanceRequiredEvent.EVENT)
  async onOffboardingClearanceRequired(
    event: OffboardingClearanceRequiredEvent,
  ): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOffboardingClearanceRequiredNotification',
        [event.ownerEmail, event],
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
      this.notificationQueueService.enqueueMailMethod(
        'sendOffboardingClearanceOverdueNotification',
        [event.ownerEmail!, event],
      ),
    );
  }

  @OnEvent(OffboardingAssetOverdueEvent.EVENT)
  async onOffboardingAssetOverdue(
    event: OffboardingAssetOverdueEvent,
  ): Promise<void> {
    if (!event.ownerEmail) {
      return;
    }

    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOffboardingAssetOverdueNotification',
        [event.ownerEmail!, event],
      ),
    );
  }

  @OnEvent(OffboardingSettlementOverdueEvent.EVENT)
  async onOffboardingSettlementOverdue(
    event: OffboardingSettlementOverdueEvent,
  ): Promise<void> {
    if (!event.ownerEmail) {
      return;
    }

    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOffboardingSettlementOverdueNotification',
        [event.ownerEmail!, event],
      ),
    );
  }

  @OnEvent(OffboardingCompletedEvent.EVENT)
  async onOffboardingCompleted(
    event: OffboardingCompletedEvent,
  ): Promise<void> {
    await this.send(() =>
      this.notificationQueueService.enqueueMailMethod(
        'sendOffboardingCompletedNotification',
        [event.employeeEmail, event.employeeName, event],
      ),
    );
    if (event.managerEmail && event.managerName) {
      await this.send(() =>
        this.notificationQueueService.enqueueMailMethod(
          'sendOffboardingCompletedNotification',
          [event.managerEmail!, event.managerName!, event],
        ),
      );
    }
    for (const hr of event.hrRecipients) {
      await this.send(() =>
        this.notificationQueueService.enqueueMailMethod(
          'sendOffboardingCompletedNotification',
          [hr.email, hr.name, event],
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
