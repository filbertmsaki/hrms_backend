import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import {
  LeaveApprovalRequiredEvent,
  LeaveApprovedEvent,
  LeaveCancelledEvent,
  LeaveRejectedEvent,
  LeaveReturnedForCorrectionEvent,
  LeaveSubmittedEvent,
  OnboardingApprovalReminderEvent,
  OnboardingApprovalRequiredEvent,
  OnboardingApprovedEvent,
  OnboardingCompletedEvent,
  OnboardingRejectedEvent,
  OnboardingSubmittedEvent,
  OnboardingTaskAssignedEvent,
  OnboardingTaskOverdueEvent,
  OffboardingApprovalReminderEvent,
  OffboardingApprovalRequiredEvent,
  OffboardingApprovedEvent,
  OffboardingClearanceOverdueEvent,
  OffboardingClearanceRequiredEvent,
  OffboardingCompletedEvent,
  OffboardingSubmittedEvent,
  OffboardingTaskAssignedEvent,
  OffboardingTaskOverdueEvent,
} from './events';

@Injectable()
export class HrInAppNotificationListener {
  private readonly logger = new Logger(HrInAppNotificationListener.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent(LeaveSubmittedEvent.EVENT)
  async onLeaveSubmitted(event: LeaveSubmittedEvent): Promise<void> {
    await this.sendMany(
      event.approvers
        .filter((recipient) => recipient.companyUserId)
        .map((recipient) => ({
          company_id: event.companyId,
          sender_company_user_id: event.senderCompanyUserId,
          receiver_company_user_id: recipient.companyUserId!,
          type: NotificationTypeEnum.LEAVE_APPROVAL_REQUIRED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'Leave Approval Required',
          message: `${event.employeeName} submitted a ${event.leaveTypeName} request that needs your review.`,
          related_module: 'leave',
          entity_type: 'LEAVE_REQUEST',
          entity_id: event.leaveRequestId,
          action_url: event.reviewUrl,
          dedupe_key: `leave:submitted:approver:${event.leaveRequestId}:${recipient.companyUserId}`,
          metadata: {
            employee_name: event.employeeName,
            leave_type_name: event.leaveTypeName,
            start_date: event.startDate,
            end_date: event.endDate,
            total_days: event.totalDays,
            reason: event.reason,
          },
        })),
    );

    if (event.employeeCompanyUserId) {
      await this.sendOne({
        company_id: event.companyId,
        sender_company_user_id: event.senderCompanyUserId,
        receiver_company_user_id: event.employeeCompanyUserId,
        type: NotificationTypeEnum.LEAVE_SUBMITTED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Leave Request Submitted',
        message: `Your ${event.leaveTypeName} request has been submitted for approval.`,
        related_module: 'leave',
        entity_type: 'LEAVE_REQUEST',
        entity_id: event.leaveRequestId,
        action_url: event.reviewUrl.replace('/review', ''),
        dedupe_key: `leave:submitted:employee:${event.leaveRequestId}:${event.employeeCompanyUserId}`,
        metadata: {
          employee_name: event.employeeName,
          leave_type_name: event.leaveTypeName,
          start_date: event.startDate,
          end_date: event.endDate,
          total_days: event.totalDays,
        },
      });
    }
  }

  @OnEvent(LeaveApprovalRequiredEvent.EVENT)
  async onLeaveApprovalRequired(
    event: LeaveApprovalRequiredEvent,
  ): Promise<void> {
    await this.sendMany(
      event.approvers
        .filter((recipient) => recipient.companyUserId)
        .map((recipient) => ({
          company_id: event.companyId,
          sender_company_user_id: event.senderCompanyUserId,
          receiver_company_user_id: recipient.companyUserId!,
          type: NotificationTypeEnum.LEAVE_APPROVAL_REQUIRED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'Leave Approval Escalated',
          message: `${event.employeeName}'s ${event.leaveTypeName} request is waiting for your action.`,
          related_module: 'leave',
          entity_type: 'LEAVE_REQUEST',
          entity_id: event.leaveRequestId,
          action_url: event.reviewUrl,
          dedupe_key: `leave:approval-required:${event.leaveRequestId}:${recipient.companyUserId}`,
          metadata: {
            employee_name: event.employeeName,
            leave_type_name: event.leaveTypeName,
            start_date: event.startDate,
            end_date: event.endDate,
            total_days: event.totalDays,
          },
        })),
    );
  }

  @OnEvent(LeaveApprovedEvent.EVENT)
  async onLeaveApproved(event: LeaveApprovedEvent): Promise<void> {
    if (!event.employeeCompanyUserId) {
      return;
    }

    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.senderCompanyUserId,
      receiver_company_user_id: event.employeeCompanyUserId,
      type: NotificationTypeEnum.LEAVE_APPROVED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.MEDIUM,
      title: 'Leave Request Approved',
      message: `Your ${event.leaveTypeName} leave request has been approved.`,
      related_module: 'leave',
      entity_type: 'LEAVE_REQUEST',
      entity_id: event.leaveRequestId,
      action_url: event.dashboardUrl,
      dedupe_key: `leave:approved:${event.leaveRequestId}:${event.employeeCompanyUserId}`,
      metadata: {
        employee_name: event.employeeName,
        leave_type_name: event.leaveTypeName,
        start_date: event.startDate,
        end_date: event.endDate,
        total_days: event.totalDays,
      },
    });
  }

  @OnEvent(LeaveRejectedEvent.EVENT)
  async onLeaveRejected(event: LeaveRejectedEvent): Promise<void> {
    if (!event.employeeCompanyUserId) {
      return;
    }

    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.senderCompanyUserId,
      receiver_company_user_id: event.employeeCompanyUserId,
      type: NotificationTypeEnum.LEAVE_REJECTED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Leave Request Rejected',
      message: `Your ${event.leaveTypeName} leave request was rejected.`,
      related_module: 'leave',
      entity_type: 'LEAVE_REQUEST',
      entity_id: event.leaveRequestId,
      action_url: event.dashboardUrl,
      dedupe_key: `leave:rejected:${event.leaveRequestId}:${event.employeeCompanyUserId}`,
      metadata: {
        employee_name: event.employeeName,
        leave_type_name: event.leaveTypeName,
        start_date: event.startDate,
        end_date: event.endDate,
        rejection_comments: event.rejectionComments,
      },
    });
  }

  @OnEvent(LeaveReturnedForCorrectionEvent.EVENT)
  async onLeaveReturnedForCorrection(
    event: LeaveReturnedForCorrectionEvent,
  ): Promise<void> {
    if (!event.employeeCompanyUserId) {
      return;
    }

    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.senderCompanyUserId,
      receiver_company_user_id: event.employeeCompanyUserId,
      type: NotificationTypeEnum.LEAVE_RETURNED_FOR_CORRECTION,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Leave Needs Correction',
      message: `Your ${event.leaveTypeName} leave request was returned for correction.`,
      related_module: 'leave',
      entity_type: 'LEAVE_REQUEST',
      entity_id: event.leaveRequestId,
      action_url: event.dashboardUrl,
      dedupe_key: `leave:return:${event.leaveRequestId}:${event.employeeCompanyUserId}`,
      metadata: {
        employee_name: event.employeeName,
        leave_type_name: event.leaveTypeName,
        start_date: event.startDate,
        end_date: event.endDate,
        return_reason: event.returnReason,
      },
    });
  }

  @OnEvent(LeaveCancelledEvent.EVENT)
  async onLeaveCancelled(event: LeaveCancelledEvent): Promise<void> {
    await this.sendMany(
      event.pendingApprovers
        .filter((recipient) => recipient.companyUserId)
        .map((recipient) => ({
          company_id: event.companyId,
          sender_company_user_id: event.senderCompanyUserId,
          receiver_company_user_id: recipient.companyUserId!,
          type: NotificationTypeEnum.LEAVE_CANCELLED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.MEDIUM,
          title: 'Leave Request Cancelled',
          message: `${event.employeeName}'s ${event.leaveTypeName} leave request was cancelled.`,
          related_module: 'leave',
          entity_type: 'LEAVE_REQUEST',
          entity_id: event.leaveRequestId,
          dedupe_key: `leave:cancelled:${event.leaveRequestId}:${recipient.companyUserId}`,
          metadata: {
            employee_name: event.employeeName,
            leave_type_name: event.leaveTypeName,
            start_date: event.startDate,
            end_date: event.endDate,
          },
        })),
    );
  }

  @OnEvent(OnboardingSubmittedEvent.EVENT)
  async onOnboardingSubmitted(event: OnboardingSubmittedEvent): Promise<void> {
    await this.sendMany(
      event.approvers
        .filter((recipient) => recipient.companyUserId)
        .map((recipient) => ({
          company_id: event.companyId,
          sender_company_user_id: event.senderCompanyUserId,
          receiver_company_user_id: recipient.companyUserId!,
          type: NotificationTypeEnum.ONBOARDING_APPROVAL_REQUIRED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'Onboarding Approval Required',
          message: `${event.employeeName}'s onboarding request needs your review.`,
          related_module: 'onboarding',
          entity_type: 'ONBOARDING_REQUEST',
          entity_id: event.onboardingRequestId,
          action_url: event.reviewUrl,
          dedupe_key: `onboarding:submitted:approver:${event.onboardingRequestId}:${recipient.companyUserId}`,
          metadata: {
            onboarding_no: event.onboardingNo,
            employee_name: event.employeeName,
          },
        })),
    );

    if (event.employeeCompanyUserId) {
      await this.sendOne({
        company_id: event.companyId,
        sender_company_user_id: event.senderCompanyUserId,
        receiver_company_user_id: event.employeeCompanyUserId,
        type: NotificationTypeEnum.ONBOARDING_SUBMITTED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Onboarding Started',
        message:
          `Your onboarding request ${event.onboardingNo ?? ''} has been started.`.trim(),
        related_module: 'onboarding',
        entity_type: 'ONBOARDING_REQUEST',
        entity_id: event.onboardingRequestId,
        action_url: event.reviewUrl.replace('/review', ''),
        dedupe_key: `onboarding:submitted:employee:${event.onboardingRequestId}:${event.employeeCompanyUserId}`,
        metadata: {
          onboarding_no: event.onboardingNo,
          employee_name: event.employeeName,
        },
      });
    }
  }

  @OnEvent(OnboardingApprovalRequiredEvent.EVENT)
  async onOnboardingApprovalRequired(
    event: OnboardingApprovalRequiredEvent,
  ): Promise<void> {
    await this.sendMany(
      event.approvers
        .filter((recipient) => recipient.companyUserId)
        .map((recipient) => ({
          company_id: event.companyId,
          sender_company_user_id: event.senderCompanyUserId,
          receiver_company_user_id: recipient.companyUserId!,
          type: NotificationTypeEnum.ONBOARDING_APPROVAL_REQUIRED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'Onboarding Approval Required',
          message: `${event.employeeName}'s onboarding request is waiting for your action.`,
          related_module: 'onboarding',
          entity_type: 'ONBOARDING_REQUEST',
          entity_id: event.onboardingRequestId,
          action_url: event.reviewUrl,
          dedupe_key: `onboarding:approval-required:${event.onboardingRequestId}:${recipient.companyUserId}`,
          metadata: {
            onboarding_no: event.onboardingNo,
            employee_name: event.employeeName,
          },
        })),
    );
  }

  @OnEvent(OnboardingApprovedEvent.EVENT)
  async onOnboardingApproved(event: OnboardingApprovedEvent): Promise<void> {
    if (event.employeeCompanyUserId) {
      await this.sendOne({
        company_id: event.companyId,
        sender_company_user_id: event.senderCompanyUserId,
        receiver_company_user_id: event.employeeCompanyUserId,
        type: NotificationTypeEnum.ONBOARDING_APPROVED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Onboarding Approved',
        message:
          `Your onboarding request ${event.onboardingNo ?? ''} has been approved.`.trim(),
        related_module: 'onboarding',
        entity_type: 'ONBOARDING_REQUEST',
        entity_id: event.onboardingRequestId,
        action_url: event.dashboardUrl,
        dedupe_key: `onboarding:approved:employee:${event.onboardingRequestId}:${event.employeeCompanyUserId}`,
        metadata: {
          onboarding_no: event.onboardingNo,
          employee_name: event.employeeName,
        },
      });
    }

    await this.sendMany(
      event.hrRecipients
        .filter((recipient) => recipient.companyUserId)
        .map((recipient) => ({
          company_id: event.companyId,
          sender_company_user_id: event.senderCompanyUserId,
          receiver_company_user_id: recipient.companyUserId!,
          type: NotificationTypeEnum.ONBOARDING_APPROVED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.MEDIUM,
          title: 'Onboarding Ready for Processing',
          message: `${event.employeeName}'s onboarding request has been approved and moved into execution.`,
          related_module: 'onboarding',
          entity_type: 'ONBOARDING_REQUEST',
          entity_id: event.onboardingRequestId,
          action_url: event.dashboardUrl,
          dedupe_key: `onboarding:approved:hr:${event.onboardingRequestId}:${recipient.companyUserId}`,
          metadata: {
            onboarding_no: event.onboardingNo,
            employee_name: event.employeeName,
          },
        })),
    );
  }

  @OnEvent(OnboardingRejectedEvent.EVENT)
  async onOnboardingRejected(event: OnboardingRejectedEvent): Promise<void> {
    if (!event.employeeCompanyUserId) {
      return;
    }

    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.senderCompanyUserId,
      receiver_company_user_id: event.employeeCompanyUserId,
      type: NotificationTypeEnum.ONBOARDING_REJECTED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Onboarding Rejected',
      message: `Your onboarding request was rejected.`,
      related_module: 'onboarding',
      entity_type: 'ONBOARDING_REQUEST',
      entity_id: event.onboardingRequestId,
      action_url: event.dashboardUrl,
      dedupe_key: `onboarding:rejected:${event.onboardingRequestId}:${event.employeeCompanyUserId}`,
      metadata: {
        onboarding_no: event.onboardingNo,
        employee_name: event.employeeName,
        rejection_comments: event.rejectionComments,
      },
    });
  }

  @OnEvent(OnboardingTaskAssignedEvent.EVENT)
  async onOnboardingTaskAssigned(
    event: OnboardingTaskAssignedEvent,
  ): Promise<void> {
    if (!event.assigneeCompanyUserId) {
      return;
    }

    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.senderCompanyUserId,
      receiver_company_user_id: event.assigneeCompanyUserId,
      type: NotificationTypeEnum.ONBOARDING_TASK_ASSIGNED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Onboarding Task Assigned',
      message: `You have been assigned "${event.taskTitle}" for ${event.employeeName}.`,
      related_module: 'onboarding',
      entity_type: 'ONBOARDING_TASK',
      entity_id: event.taskId,
      action_url: event.taskUrl,
      dedupe_key: `onboarding:task-assigned:${event.taskId}:${event.assigneeCompanyUserId}`,
      metadata: {
        onboarding_request_id: event.onboardingRequestId,
        task_id: event.taskId,
        task_no: event.taskNo,
        employee_name: event.employeeName,
        due_date: event.dueDate,
      },
    });
  }

  @OnEvent(OnboardingTaskOverdueEvent.EVENT)
  async onOnboardingTaskOverdue(
    event: OnboardingTaskOverdueEvent,
  ): Promise<void> {
    if (!event.assignedCompanyUserId) {
      return;
    }

    const dayKey = new Date().toISOString().slice(0, 10);

    await this.sendOne({
      company_id: event.companyId,
      receiver_company_user_id: event.assignedCompanyUserId,
      type: NotificationTypeEnum.ONBOARDING_TASK_OVERDUE,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Onboarding Task Overdue',
      message: `The onboarding task "${event.taskTitle}" for ${event.employeeName} is overdue.`,
      related_module: 'onboarding',
      entity_type: 'ONBOARDING_TASK',
      entity_id: event.taskId,
      action_url: `/onboarding/${event.onboardingRequestId}/tasks`,
      dedupe_key: `onboarding:task-overdue:${event.taskId}:${event.assignedCompanyUserId}:${dayKey}`,
      metadata: {
        onboarding_request_id: event.onboardingRequestId,
        employee_name: event.employeeName,
        due_date: event.dueDate,
      },
    });
  }

  @OnEvent(OnboardingApprovalReminderEvent.EVENT)
  async onOnboardingApprovalReminder(
    event: OnboardingApprovalReminderEvent,
  ): Promise<void> {
    const dayKey = new Date().toISOString().slice(0, 10);

    await this.sendMany(
      event.approverCompanyUserIds.map((companyUserId) => ({
        company_id: event.companyId,
        receiver_company_user_id: companyUserId,
        type: NotificationTypeEnum.ONBOARDING_APPROVAL_REMINDER,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Onboarding Approval Reminder',
        message: `${event.employeeName}'s onboarding request still needs your review.`,
        related_module: 'onboarding',
        entity_type: 'ONBOARDING_APPROVAL',
        entity_id: event.approvalId,
        action_url: `/onboarding/${event.onboardingRequestId}/review`,
        dedupe_key: `onboarding:approval-reminder:${event.approvalId}:${companyUserId}:${dayKey}`,
        metadata: {
          onboarding_request_id: event.onboardingRequestId,
          approval_level: event.approvalLevel,
          employee_name: event.employeeName,
        },
      })),
    );
  }

  @OnEvent(OnboardingCompletedEvent.EVENT)
  async onOnboardingCompleted(event: OnboardingCompletedEvent): Promise<void> {
    if (event.employeeCompanyUserId) {
      await this.sendOne({
        company_id: event.companyId,
        sender_company_user_id: event.senderCompanyUserId,
        receiver_company_user_id: event.employeeCompanyUserId,
        type: NotificationTypeEnum.ONBOARDING_COMPLETED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Onboarding Completed',
        message: 'Your onboarding has been completed successfully.',
        related_module: 'onboarding',
        entity_type: 'ONBOARDING_REQUEST',
        entity_id: event.onboardingRequestId,
        action_url: event.dashboardUrl,
        dedupe_key: `onboarding:completed:employee:${event.onboardingRequestId}:${event.employeeCompanyUserId}`,
        metadata: {
          onboarding_no: event.onboardingNo,
          employee_name: event.employeeName,
        },
      });
    }

    if (event.managerCompanyUserId) {
      await this.sendOne({
        company_id: event.companyId,
        sender_company_user_id: event.senderCompanyUserId,
        receiver_company_user_id: event.managerCompanyUserId,
        type: NotificationTypeEnum.ONBOARDING_COMPLETED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Employee Onboarding Completed',
        message: `${event.employeeName}'s onboarding has been completed.`,
        related_module: 'onboarding',
        entity_type: 'ONBOARDING_REQUEST',
        entity_id: event.onboardingRequestId,
        action_url: event.dashboardUrl,
        dedupe_key: `onboarding:completed:manager:${event.onboardingRequestId}:${event.managerCompanyUserId}`,
        metadata: {
          onboarding_no: event.onboardingNo,
          employee_name: event.employeeName,
        },
      });
    }
  }

  @OnEvent(OffboardingSubmittedEvent.EVENT)
  async onOffboardingSubmitted(
    event: OffboardingSubmittedEvent,
  ): Promise<void> {
    await this.sendMany(
      event.approvers
        .filter((recipient) => recipient.companyUserId)
        .map((recipient) => ({
          company_id: event.companyId,
          sender_company_user_id: event.senderCompanyUserId,
          receiver_company_user_id: recipient.companyUserId!,
          type: NotificationTypeEnum.OFFBOARDING_APPROVAL_REQUIRED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'Offboarding Approval Required',
          message: `${event.employeeName}'s offboarding request needs your review.`,
          related_module: 'offboarding',
          entity_type: 'OFFBOARDING_REQUEST',
          entity_id: event.offboardingRequestId,
          action_url: event.reviewUrl,
          dedupe_key: `offboarding:submitted:approver:${event.offboardingRequestId}:${recipient.companyUserId}`,
          metadata: {
            employee_name: event.employeeName,
            exit_date: event.exitDate,
          },
        })),
    );

    if (event.employeeCompanyUserId) {
      await this.sendOne({
        company_id: event.companyId,
        sender_company_user_id: event.senderCompanyUserId,
        receiver_company_user_id: event.employeeCompanyUserId,
        type: NotificationTypeEnum.OFFBOARDING_SUBMITTED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Offboarding Submitted',
        message: 'Your offboarding request has been submitted successfully.',
        related_module: 'offboarding',
        entity_type: 'OFFBOARDING_REQUEST',
        entity_id: event.offboardingRequestId,
        action_url: event.reviewUrl.replace('/review', ''),
        dedupe_key: `offboarding:submitted:employee:${event.offboardingRequestId}:${event.employeeCompanyUserId}`,
        metadata: {
          employee_name: event.employeeName,
          exit_date: event.exitDate,
        },
      });
    }
  }

  @OnEvent(OffboardingApprovalRequiredEvent.EVENT)
  async onOffboardingApprovalRequired(
    event: OffboardingApprovalRequiredEvent,
  ): Promise<void> {
    await this.sendMany(
      event.approvers
        .filter((recipient) => recipient.companyUserId)
        .map((recipient) => ({
          company_id: event.companyId,
          sender_company_user_id: event.senderCompanyUserId,
          receiver_company_user_id: recipient.companyUserId!,
          type: NotificationTypeEnum.OFFBOARDING_APPROVAL_REQUIRED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'Offboarding Approval Required',
          message: `${event.employeeName}'s offboarding request is waiting for your action.`,
          related_module: 'offboarding',
          entity_type: 'OFFBOARDING_REQUEST',
          entity_id: event.offboardingRequestId,
          action_url: event.reviewUrl,
          dedupe_key: `offboarding:approval-required:${event.offboardingRequestId}:${recipient.companyUserId}`,
          metadata: {
            employee_name: event.employeeName,
            exit_date: event.exitDate,
          },
        })),
    );
  }

  @OnEvent(OffboardingApprovedEvent.EVENT)
  async onOffboardingApproved(event: OffboardingApprovedEvent): Promise<void> {
    if (event.employeeCompanyUserId) {
      await this.sendOne({
        company_id: event.companyId,
        sender_company_user_id: event.senderCompanyUserId,
        receiver_company_user_id: event.employeeCompanyUserId,
        type: NotificationTypeEnum.OFFBOARDING_APPROVED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Offboarding Approved',
        message: 'Your offboarding request has been approved.',
        related_module: 'offboarding',
        entity_type: 'OFFBOARDING_REQUEST',
        entity_id: event.offboardingRequestId,
        action_url: event.dashboardUrl,
        dedupe_key: `offboarding:approved:employee:${event.offboardingRequestId}:${event.employeeCompanyUserId}`,
        metadata: {
          employee_name: event.employeeName,
          exit_date: event.exitDate,
        },
      });
    }

    await this.sendMany(
      event.hrRecipients
        .filter((recipient) => recipient.companyUserId)
        .map((recipient) => ({
          company_id: event.companyId,
          sender_company_user_id: event.senderCompanyUserId,
          receiver_company_user_id: recipient.companyUserId!,
          type: NotificationTypeEnum.OFFBOARDING_APPROVED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.MEDIUM,
          title: 'Offboarding Ready for Processing',
          message: `${event.employeeName}'s offboarding request has been approved.`,
          related_module: 'offboarding',
          entity_type: 'OFFBOARDING_REQUEST',
          entity_id: event.offboardingRequestId,
          action_url: event.dashboardUrl,
          dedupe_key: `offboarding:approved:hr:${event.offboardingRequestId}:${recipient.companyUserId}`,
          metadata: {
            employee_name: event.employeeName,
            exit_date: event.exitDate,
          },
        })),
    );
  }

  @OnEvent(OffboardingTaskAssignedEvent.EVENT)
  async onOffboardingTaskAssigned(
    event: OffboardingTaskAssignedEvent,
  ): Promise<void> {
    if (!event.assigneeCompanyUserId) {
      return;
    }

    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.senderCompanyUserId,
      receiver_company_user_id: event.assigneeCompanyUserId,
      type: NotificationTypeEnum.OFFBOARDING_TASK_ASSIGNED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Offboarding Task Assigned',
      message: `You have been assigned "${event.taskTitle}" for ${event.employeeName}.`,
      related_module: 'offboarding',
      entity_type: 'OFFBOARDING_TASK',
      entity_id: event.taskId,
      action_url: event.taskUrl,
      dedupe_key: `offboarding:task-assigned:${event.taskId}:${event.assigneeCompanyUserId}`,
      metadata: {
        offboarding_request_id: event.offboardingRequestId,
        employee_name: event.employeeName,
        exit_date: event.exitDate,
        due_date: event.dueDate,
      },
    });
  }

  @OnEvent(OffboardingTaskOverdueEvent.EVENT)
  async onOffboardingTaskOverdue(
    event: OffboardingTaskOverdueEvent,
  ): Promise<void> {
    if (!event.assigneeCompanyUserId) {
      return;
    }

    const dayKey = new Date().toISOString().slice(0, 10);

    await this.sendOne({
      company_id: event.companyId,
      receiver_company_user_id: event.assigneeCompanyUserId,
      type: NotificationTypeEnum.OFFBOARDING_TASK_OVERDUE,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Offboarding Task Overdue',
      message: `The offboarding task "${event.taskTitle}" for ${event.employeeName} is overdue.`,
      related_module: 'offboarding',
      entity_type: 'OFFBOARDING_TASK',
      entity_id: event.taskId,
      action_url: `/offboarding/${event.offboardingRequestId}/tasks`,
      dedupe_key: `offboarding:task-overdue:${event.taskId}:${event.assigneeCompanyUserId}:${dayKey}`,
      metadata: {
        offboarding_request_id: event.offboardingRequestId,
        employee_name: event.employeeName,
        exit_date: event.exitDate,
        due_date: event.dueDate,
      },
    });
  }

  @OnEvent(OffboardingApprovalReminderEvent.EVENT)
  async onOffboardingApprovalReminder(
    event: OffboardingApprovalReminderEvent,
  ): Promise<void> {
    if (!event.approverCompanyUserId) {
      return;
    }

    const dayKey = new Date().toISOString().slice(0, 10);

    await this.sendOne({
      company_id: event.companyId,
      receiver_company_user_id: event.approverCompanyUserId,
      type: NotificationTypeEnum.OFFBOARDING_APPROVAL_REMINDER,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.MEDIUM,
      title: 'Offboarding Approval Reminder',
      message: `${event.employeeName}'s offboarding request still needs your review.`,
      related_module: 'offboarding',
      entity_type: 'OFFBOARDING_APPROVAL',
      entity_id: event.approvalId,
      action_url: `/offboarding/${event.offboardingRequestId}/review`,
      dedupe_key: `offboarding:approval-reminder:${event.approvalId}:${event.approverCompanyUserId}:${dayKey}`,
      metadata: {
        offboarding_request_id: event.offboardingRequestId,
        approval_level: event.approvalLevel,
        employee_name: event.employeeName,
        exit_date: event.exitDate,
      },
    });
  }

  @OnEvent(OffboardingClearanceRequiredEvent.EVENT)
  async onOffboardingClearanceRequired(
    event: OffboardingClearanceRequiredEvent,
  ): Promise<void> {
    if (!event.ownerCompanyUserId) {
      return;
    }

    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.senderCompanyUserId,
      receiver_company_user_id: event.ownerCompanyUserId,
      type: NotificationTypeEnum.OFFBOARDING_CLEARANCE_REQUIRED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Offboarding Clearance Required',
      message: `${event.clearanceType} clearance is required for ${event.employeeName}.`,
      related_module: 'offboarding',
      entity_type: 'OFFBOARDING_CLEARANCE',
      entity_id: event.clearanceId,
      action_url: event.clearanceUrl,
      dedupe_key: `offboarding:clearance-required:${event.clearanceId}:${event.ownerCompanyUserId}`,
      metadata: {
        employee_name: event.employeeName,
        clearance_type: event.clearanceType,
        exit_date: event.exitDate,
      },
    });
  }

  @OnEvent(OffboardingClearanceOverdueEvent.EVENT)
  async onOffboardingClearanceOverdue(
    event: OffboardingClearanceOverdueEvent,
  ): Promise<void> {
    if (!event.ownerCompanyUserId) {
      return;
    }

    const dayKey = new Date().toISOString().slice(0, 10);

    await this.sendOne({
      company_id: event.companyId,
      receiver_company_user_id: event.ownerCompanyUserId,
      type: NotificationTypeEnum.OFFBOARDING_CLEARANCE_OVERDUE,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Offboarding Clearance Overdue',
      message: `${event.clearanceType} clearance for ${event.employeeName} is overdue.`,
      related_module: 'offboarding',
      entity_type: 'OFFBOARDING_CLEARANCE',
      entity_id: event.clearanceId,
      action_url: `/offboarding/${event.offboardingRequestId}/clearances`,
      dedupe_key: `offboarding:clearance-overdue:${event.clearanceId}:${event.ownerCompanyUserId}:${dayKey}`,
      metadata: {
        offboarding_request_id: event.offboardingRequestId,
        employee_name: event.employeeName,
        clearance_type: event.clearanceType,
        exit_date: event.exitDate,
        due_date: event.dueDate,
      },
    });
  }

  @OnEvent(OffboardingCompletedEvent.EVENT)
  async onOffboardingCompleted(
    event: OffboardingCompletedEvent,
  ): Promise<void> {
    if (event.employeeCompanyUserId) {
      await this.sendOne({
        company_id: event.companyId,
        sender_company_user_id: event.senderCompanyUserId,
        receiver_company_user_id: event.employeeCompanyUserId,
        type: NotificationTypeEnum.OFFBOARDING_COMPLETED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Offboarding Completed',
        message: 'Your offboarding process has been completed.',
        related_module: 'offboarding',
        entity_type: 'OFFBOARDING_REQUEST',
        entity_id: event.offboardingRequestId,
        dedupe_key: `offboarding:completed:employee:${event.offboardingRequestId}:${event.employeeCompanyUserId}`,
        metadata: {
          employee_name: event.employeeName,
          exit_date: event.exitDate,
        },
      });
    }

    if (event.managerCompanyUserId) {
      await this.sendOne({
        company_id: event.companyId,
        sender_company_user_id: event.senderCompanyUserId,
        receiver_company_user_id: event.managerCompanyUserId,
        type: NotificationTypeEnum.OFFBOARDING_COMPLETED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Employee Offboarding Completed',
        message: `${event.employeeName}'s offboarding has been completed.`,
        related_module: 'offboarding',
        entity_type: 'OFFBOARDING_REQUEST',
        entity_id: event.offboardingRequestId,
        dedupe_key: `offboarding:completed:manager:${event.offboardingRequestId}:${event.managerCompanyUserId}`,
        metadata: {
          employee_name: event.employeeName,
          exit_date: event.exitDate,
        },
      });
    }

    await this.sendMany(
      event.hrRecipients
        .filter((recipient) => recipient.companyUserId)
        .map((recipient) => ({
          company_id: event.companyId,
          sender_company_user_id: event.senderCompanyUserId,
          receiver_company_user_id: recipient.companyUserId!,
          type: NotificationTypeEnum.OFFBOARDING_COMPLETED,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.MEDIUM,
          title: 'Offboarding Completed',
          message: `${event.employeeName}'s offboarding has been completed.`,
          related_module: 'offboarding',
          entity_type: 'OFFBOARDING_REQUEST',
          entity_id: event.offboardingRequestId,
          dedupe_key: `offboarding:completed:hr:${event.offboardingRequestId}:${recipient.companyUserId}`,
          metadata: {
            employee_name: event.employeeName,
            exit_date: event.exitDate,
          },
        })),
    );
  }

  private async sendOne(
    input: Parameters<NotificationsService['createAndPush']>[0],
  ): Promise<void> {
    try {
      await this.notificationsService.createAndPush(input);
    } catch (error) {
      this.logger.error(
        'In-app HR notification delivery failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async sendMany(
    inputs: Parameters<NotificationsService['createAndPushMany']>[0],
  ): Promise<void> {
    for (const input of inputs) {
      await this.sendOne(input);
    }
  }
}
