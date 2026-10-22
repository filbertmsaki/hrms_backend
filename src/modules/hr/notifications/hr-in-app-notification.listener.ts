import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { HR_NOTIFICATION_ROLE_NAMES } from './notification-recipient.util';
import { ActionItemIssueReportedEvent } from './events/action-item.events';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationQueueService } from '../../notifications/notification-queue.service';
import { SmsNotificationManagementService } from '../../sms/sms-notification-management.service';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { ActionItemTypeEnum } from '../action-inbox/enums/action-item-type.enum';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import {
  EmployeeInvitationAcceptedEvent,
  LeaveApprovalRequiredEvent,
  LeaveApprovedEvent,
  LeaveCancelledEvent,
  LeaveRejectedEvent,
  LeaveReturnedForCorrectionEvent,
  LeaveSubmittedEvent,
  OnboardingApprovalReminderEvent,
  OnboardingDocumentReminderEvent,
  OnboardingApprovalRequiredEvent,
  OnboardingApprovedEvent,
  OnboardingCompletedEvent,
  OnboardingEmployeeDetailsReviewedEvent,
  OnboardingEmployeeDetailsReturnedEvent,
  OnboardingEmployeeDetailsSubmittedEvent,
  OnboardingRejectedEvent,
  OnboardingSubmittedEvent,
  OnboardingTaskAssignedEvent,
  OnboardingTaskCompletedEvent,
  OnboardingWorkspaceNoteEvent,
  OnboardingActivationReadyEvent,
  OnboardingTaskOverdueEvent,
  OffboardingApprovalReminderEvent,
  OffboardingApprovalRequiredEvent,
  OffboardingApprovedEvent,
  OffboardingRejectedEvent,
  OffboardingAssetOverdueEvent,
  OffboardingClearanceOverdueEvent,
  OffboardingClearanceRequiredEvent,
  OffboardingCompletedEvent,
  OffboardingSettlementOverdueEvent,
  OffboardingSubmittedEvent,
  OffboardingTaskAssignedEvent,
  OffboardingTaskCompletedEvent,
  OffboardingTaskOverdueEvent,
} from './events';

@Injectable()
export class HrInAppNotificationListener {
  private readonly logger = new Logger(HrInAppNotificationListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly actionItemsService: ActionItemsService,
    private readonly smsNotificationManagementService: SmsNotificationManagementService,
    private readonly notificationQueueService: NotificationQueueService,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
  ) {}

  @OnEvent(ActionItemIssueReportedEvent.EVENT)
  async onActionItemIssueReported(
    event: ActionItemIssueReportedEvent,
  ): Promise<void> {
    const recipients = new Set(
      await this.resolveHrCompanyUserIds(event.companyId),
    );
    await this.sendMany(
      [...recipients].map((receiverCompanyUserId) => ({
        company_id: event.companyId,
        sender_company_user_id: event.reportedByCompanyUserId,
        receiver_company_user_id: receiverCompanyUserId,
        type: NotificationTypeEnum.GENERAL,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.HIGH,
        title: 'Assigned Work Needs HR Attention',
        message: `${event.reportedBy} reported an issue with "${event.title}": ${event.comment}`,
        related_module: event.sourceModule,
        entity_type: event.sourceEntityType,
        entity_id: event.sourceEntityId,
        action_url: event.actionUrl ?? undefined,
        dedupe_key: `action-item:issue:${event.commentId}:${receiverCompanyUserId}`,
        metadata: {
          action_item_id: event.actionItemId,
          comment: event.comment,
        },
      })),
    );
  }

  private async resolveHrCompanyUserIds(companyId: number): Promise<number[]> {
    const memberships = await this.companyUserRepository.find({
      where: {
        company_id: companyId,
        status: 'active',
        role_assignments: {
          role: {
            company_id: companyId,
            name: In([...HR_NOTIFICATION_ROLE_NAMES]),
          },
        },
      },
      select: { id: true },
    });
    return memberships.map((membership) => membership.id);
  }

  private async openApprovalActionItem(input: {
    companyId: number;
    approverCompanyUserId: number;
    approverEmployeeId?: number | null;
    approverBranchId?: number | null;
    approverDepartmentId?: number | null;
    sourceModule: string;
    sourceEntityType: string;
    sourceEntityId: string | number;
    title: string;
    description?: string | null;
    actionUrl?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.actionItemsService.upsertOpen({
        companyId: input.companyId,
        assigneeCompanyUserId: input.approverCompanyUserId,
        assigneeEmployeeId: input.approverEmployeeId ?? null,
        actionType: ActionItemTypeEnum.APPROVAL,
        sourceModule: input.sourceModule,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        sourceKey: `${input.sourceModule}:approval:${input.sourceEntityId}:${input.approverCompanyUserId}`,
        title: input.title,
        description: input.description ?? null,
        priority: 'HIGH',
        branchId: input.approverBranchId ?? null,
        departmentId: input.approverDepartmentId ?? null,
        actionUrl: input.actionUrl ?? null,
        metadata: input.metadata ?? null,
      });
    } catch (error) {
      this.logger.error(
        'Failed to open approval action item',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async closeActionItems(
    companyId: number,
    sourceModule: string,
    sourceEntityType: string,
    sourceEntityId: string | number,
  ): Promise<void> {
    try {
      await this.actionItemsService.completeAllOpenForEntity(
        companyId,
        sourceModule,
        sourceEntityType,
        sourceEntityId,
      );
    } catch (error) {
      this.logger.error(
        'Failed to close action items',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

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
          dedupe_key: `leave:submitted:approver:${event.leaveRequestId}:${event.approvalCycle}:${recipient.companyUserId}`,
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

    for (const recipient of event.approvers) {
      if (!recipient.companyUserId) continue;
      await this.sendSms({
        code: 'leave.approval.required',
        module: 'leave',
        recipientCompanyUserId: recipient.companyUserId,
        relatedEntityType: 'LEAVE_REQUEST',
        relatedEntityId: event.leaveRequestId,
        variables: {
          employee_name: event.employeeName,
          leave_type_name: event.leaveTypeName,
          start_date: event.startDate,
          end_date: event.endDate,
          total_days: event.totalDays,
        },
      });
    }

    for (const recipient of event.approvers) {
      if (!recipient.companyUserId) continue;
      await this.openApprovalActionItem({
        companyId: event.companyId,
        approverCompanyUserId: recipient.companyUserId,
        approverEmployeeId: recipient.employeeId,
        approverBranchId: recipient.branchId,
        approverDepartmentId: recipient.departmentId,
        sourceModule: 'leave',
        sourceEntityType: 'LEAVE_REQUEST',
        sourceEntityId: event.leaveRequestId,
        title: 'Leave approval required',
        description: `${event.employeeName}'s ${event.leaveTypeName} request needs your review.`,
        actionUrl: event.reviewUrl,
        metadata: { employee_name: event.employeeName },
      });
    }

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
        action_url: `/dashboard/me/leave/requests?highlight=${event.leaveRequestId}`,
        dedupe_key: `leave:submitted:employee:${event.leaveRequestId}:${event.approvalCycle}:${event.employeeCompanyUserId}`,
        metadata: {
          employee_name: event.employeeName,
          leave_type_name: event.leaveTypeName,
          start_date: event.startDate,
          end_date: event.endDate,
          total_days: event.totalDays,
        },
      });

      await this.sendSms({
        code: 'leave.application.submitted',
        module: 'leave',
        recipientCompanyUserId: event.employeeCompanyUserId,
        relatedEntityType: 'LEAVE_REQUEST',
        relatedEntityId: event.leaveRequestId,
        variables: {
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
    await this.closeActionItems(
      event.companyId,
      'leave',
      'LEAVE_REQUEST',
      event.leaveRequestId,
    );
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
          dedupe_key: `leave:approval-required:${event.leaveRequestId}:${event.approvalCycle}:${recipient.companyUserId}`,
          metadata: {
            employee_name: event.employeeName,
            leave_type_name: event.leaveTypeName,
            start_date: event.startDate,
            end_date: event.endDate,
            total_days: event.totalDays,
          },
        })),
    );

    for (const recipient of event.approvers) {
      if (!recipient.companyUserId) continue;
      await this.sendSms({
        code: 'leave.approval.required',
        module: 'leave',
        recipientCompanyUserId: recipient.companyUserId,
        relatedEntityType: 'LEAVE_REQUEST',
        relatedEntityId: event.leaveRequestId,
        variables: {
          employee_name: event.employeeName,
          leave_type_name: event.leaveTypeName,
          start_date: event.startDate,
          end_date: event.endDate,
          total_days: event.totalDays,
        },
      });
    }

    for (const recipient of event.approvers) {
      if (!recipient.companyUserId) continue;
      await this.openApprovalActionItem({
        companyId: event.companyId,
        approverCompanyUserId: recipient.companyUserId,
        approverEmployeeId: recipient.employeeId,
        approverBranchId: recipient.branchId,
        approverDepartmentId: recipient.departmentId,
        sourceModule: 'leave',
        sourceEntityType: 'LEAVE_REQUEST',
        sourceEntityId: event.leaveRequestId,
        title: 'Leave approval required',
        description: `${event.employeeName}'s ${event.leaveTypeName} request is waiting for your action.`,
        actionUrl: event.reviewUrl,
        metadata: { employee_name: event.employeeName },
      });
    }
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

    await this.sendSms({
      code: 'leave.approved',
      module: 'leave',
      recipientCompanyUserId: event.employeeCompanyUserId,
      relatedEntityType: 'LEAVE_REQUEST',
      relatedEntityId: event.leaveRequestId,
      variables: {
        employee_name: event.employeeName,
        leave_type_name: event.leaveTypeName,
        start_date: event.startDate,
        end_date: event.endDate,
        total_days: event.totalDays,
      },
    });

    await this.closeActionItems(
      event.companyId,
      'leave',
      'LEAVE_REQUEST',
      event.leaveRequestId,
    );
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

    await this.sendSms({
      code: 'leave.rejected',
      module: 'leave',
      recipientCompanyUserId: event.employeeCompanyUserId,
      relatedEntityType: 'LEAVE_REQUEST',
      relatedEntityId: event.leaveRequestId,
      variables: {
        employee_name: event.employeeName,
        leave_type_name: event.leaveTypeName,
        start_date: event.startDate,
        end_date: event.endDate,
        rejection_comments: event.rejectionComments,
      },
    });

    await this.closeActionItems(
      event.companyId,
      'leave',
      'LEAVE_REQUEST',
      event.leaveRequestId,
    );
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

    await this.closeActionItems(
      event.companyId,
      'leave',
      'LEAVE_REQUEST',
      event.leaveRequestId,
    );
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

    await this.closeActionItems(
      event.companyId,
      'leave',
      'LEAVE_REQUEST',
      event.leaveRequestId,
    );
  }

  @OnEvent(OnboardingEmployeeDetailsSubmittedEvent.EVENT)
  async onOnboardingEmployeeDetailsSubmitted(
    event: OnboardingEmployeeDetailsSubmittedEvent,
  ): Promise<void> {
    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.employeeCompanyUserId,
      receiver_company_user_id: event.reviewerCompanyUserId,
      type: NotificationTypeEnum.ONBOARDING_SUBMITTED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Employee Details Ready for Review',
      message: `${event.employeeName} has completed and submitted their onboarding details. Review each section before starting the workflow.`,
      related_module: 'onboarding',
      entity_type: 'ONBOARDING_REQUEST',
      entity_id: event.onboardingRequestId,
      action_url: event.reviewUrl,
      dedupe_key: `onboarding:employee-details-submitted:${event.onboardingRequestId}:${event.reviewerCompanyUserId}:${Date.now()}`,
      channels: [
        NotificationChannelEnum.IN_APP,
        NotificationChannelEnum.EMAIL,
        NotificationChannelEnum.SMS,
      ],
      metadata: {
        onboarding_no: event.onboardingNo,
        employee_name: event.employeeName,
        stage: 'employee_details_review',
      },
    });

    await this.openApprovalActionItem({
      companyId: event.companyId,
      approverCompanyUserId: event.reviewerCompanyUserId,
      sourceModule: 'onboarding',
      sourceEntityType: 'ONBOARDING_REQUEST',
      sourceEntityId: event.onboardingRequestId,
      title: 'Review employee onboarding details',
      description: `${event.employeeName} submitted onboarding details for HR review.`,
      actionUrl: event.reviewUrl,
      metadata: {
        onboarding_no: event.onboardingNo,
        employee_name: event.employeeName,
        stage: 'employee_details_review',
      },
    });
  }

  @OnEvent(OnboardingEmployeeDetailsReturnedEvent.EVENT)
  async onOnboardingEmployeeDetailsReturned(
    event: OnboardingEmployeeDetailsReturnedEvent,
  ): Promise<void> {
    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.reviewerCompanyUserId,
      receiver_company_user_id: event.employeeCompanyUserId,
      type: NotificationTypeEnum.ONBOARDING_REJECTED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Onboarding Details Need Changes',
      message: `HR returned these sections for correction: ${event.sectionLabels.join(', ')}. Open your onboarding page to see the reasons.`,
      related_module: 'onboarding',
      entity_type: 'ONBOARDING_REQUEST',
      entity_id: event.onboardingRequestId,
      action_url: event.employeeUrl,
      dedupe_key: `onboarding:employee-details-returned:${event.onboardingRequestId}:${event.employeeCompanyUserId}:${Date.now()}`,
      channels: [
        NotificationChannelEnum.IN_APP,
        NotificationChannelEnum.EMAIL,
        NotificationChannelEnum.SMS,
      ],
      metadata: {
        onboarding_no: event.onboardingNo,
        employee_name: event.employeeName,
        returned_sections: event.sectionLabels,
      },
    });
  }

  @OnEvent(OnboardingEmployeeDetailsReviewedEvent.EVENT)
  async onOnboardingEmployeeDetailsReviewed(
    event: OnboardingEmployeeDetailsReviewedEvent,
  ): Promise<void> {
    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.reviewerCompanyUserId,
      receiver_company_user_id: event.employeeCompanyUserId,
      type: NotificationTypeEnum.ONBOARDING_APPROVED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.MEDIUM,
      title: 'Onboarding Section Approved',
      message: `HR approved: ${event.sectionLabels.join(', ')}. You can view the latest review status from your onboarding page.`,
      related_module: 'onboarding',
      entity_type: 'ONBOARDING_REQUEST',
      entity_id: event.onboardingRequestId,
      action_url: event.employeeUrl,
      dedupe_key: `onboarding:employee-details-reviewed:${event.onboardingRequestId}:${event.employeeCompanyUserId}:${Date.now()}`,
      channels: [
        NotificationChannelEnum.IN_APP,
        NotificationChannelEnum.EMAIL,
        NotificationChannelEnum.SMS,
      ],
      metadata: {
        onboarding_no: event.onboardingNo,
        employee_name: event.employeeName,
        approved_sections: event.sectionLabels,
      },
    });
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

    for (const recipient of event.approvers) {
      if (!recipient.companyUserId) continue;
      await this.openApprovalActionItem({
        companyId: event.companyId,
        approverCompanyUserId: recipient.companyUserId,
        approverEmployeeId: recipient.employeeId,
        approverBranchId: recipient.branchId,
        approverDepartmentId: recipient.departmentId,
        sourceModule: 'onboarding',
        sourceEntityType: 'ONBOARDING_REQUEST',
        sourceEntityId: event.onboardingRequestId,
        title: 'Onboarding approval required',
        description: `${event.employeeName}'s onboarding request needs your review.`,
        actionUrl: event.reviewUrl,
        metadata: {
          onboarding_no: event.onboardingNo,
          employee_name: event.employeeName,
        },
      });
    }

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
        action_url: event.employeeUrl,
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

    for (const recipient of event.approvers) {
      if (!recipient.companyUserId) continue;
      await this.openApprovalActionItem({
        companyId: event.companyId,
        approverCompanyUserId: recipient.companyUserId,
        approverEmployeeId: recipient.employeeId,
        approverBranchId: recipient.branchId,
        approverDepartmentId: recipient.departmentId,
        sourceModule: 'onboarding',
        sourceEntityType: 'ONBOARDING_REQUEST',
        sourceEntityId: event.onboardingRequestId,
        title: 'Onboarding approval required',
        description: `${event.employeeName}'s onboarding request is waiting for your action.`,
        actionUrl: event.reviewUrl,
        metadata: {
          onboarding_no: event.onboardingNo,
          employee_name: event.employeeName,
        },
      });
    }
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

    await this.closeActionItems(
      event.companyId,
      'onboarding',
      'ONBOARDING_REQUEST',
      event.onboardingRequestId,
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

    await this.closeActionItems(
      event.companyId,
      'onboarding',
      'ONBOARDING_REQUEST',
      event.onboardingRequestId,
    );
  }

  @OnEvent(OnboardingTaskAssignedEvent.EVENT)
  async onOnboardingTaskAssigned(
    event: OnboardingTaskAssignedEvent,
  ): Promise<void> {
    if (!event.assigneeCompanyUserId) {
      return;
    }

    try {
      await this.actionItemsService.upsertOpen({
        companyId: event.companyId,
        assigneeCompanyUserId: event.assigneeCompanyUserId,
        actionType: ActionItemTypeEnum.TASK,
        sourceModule: 'onboarding',
        sourceEntityType: 'ONBOARDING_TASK',
        sourceEntityId: event.taskId,
        sourceKey: `onboarding:task:${event.taskId}:${event.assigneeCompanyUserId}`,
        title: event.taskTitle,
        description: event.taskDescription,
        priority: 'HIGH',
        actionUrl: event.taskUrl,
        dueAt: event.dueDate,
        metadata: {
          onboarding_request_id: event.onboardingRequestId,
          employee_name: event.employeeName,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to open onboarding task action item',
        error instanceof Error ? error.stack : String(error),
      );
    }

    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: event.senderCompanyUserId,
      receiver_company_user_id: event.assigneeCompanyUserId,
      type: NotificationTypeEnum.ONBOARDING_TASK_ASSIGNED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Onboarding Task Assigned',
      message: [
        `You have been assigned "${event.taskTitle}" for ${event.employeeName}.`,
        event.taskDescription?.trim(),
      ]
        .filter(Boolean)
        .join(' '),
      related_module: 'onboarding',
      entity_type: 'ONBOARDING_TASK',
      entity_id: event.taskId,
      action_url: event.taskUrl,
      dedupe_key: `onboarding:task-assigned:${event.taskId}:${event.assigneeCompanyUserId}`,
      channels: [
        NotificationChannelEnum.IN_APP,
        NotificationChannelEnum.EMAIL,
        NotificationChannelEnum.SMS,
      ],
      metadata: {
        onboarding_request_id: event.onboardingRequestId,
        task_id: event.taskId,
        task_no: event.taskNo,
        employee_name: event.employeeName,
        due_date: event.dueDate,
      },
    });
  }

  @OnEvent(OnboardingActivationReadyEvent.EVENT, { suppressErrors: false })
  async onOnboardingActivationReady(
    event: OnboardingActivationReadyEvent,
  ): Promise<void> {
    const recipients = await this.resolveHrCompanyUserIds(event.companyId);
    for (const receiverCompanyUserId of new Set(recipients)) {
      await this.notificationsService.createAndPush({
        company_id: event.companyId,
        receiver_company_user_id: receiverCompanyUserId,
        type: NotificationTypeEnum.GENERAL,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.HIGH,
        title: 'Employee ready for activation',
        message: `${event.employeeName} (${event.onboardingNo}) passed all mandatory requirements at the latest readiness check. Review and activate the employee.`,
        related_module: 'onboarding',
        entity_type: 'ONBOARDING_REQUEST',
        entity_id: event.onboardingRequestId,
        action_url: `/dashboard/employees/onboarding?tab=requests&request_id=${event.onboardingRequestId}`,
        dedupe_key: `onboarding:activation-ready:${event.onboardingRequestId}:${receiverCompanyUserId}`,
        metadata: {
          onboarding_request_id: event.onboardingRequestId,
          event: 'activation_ready',
        },
      });
    }
  }

  @OnEvent(OnboardingWorkspaceNoteEvent.EVENT)
  async onOnboardingWorkspaceNote(
    event: OnboardingWorkspaceNoteEvent,
  ): Promise<void> {
    const recipients = new Set(
      await this.resolveHrCompanyUserIds(event.companyId),
    );
    if (event.employeeVisible && event.employeeMemberId)
      recipients.add(event.employeeMemberId);
    recipients.delete(event.senderId);
    for (const receiverId of recipients) {
      await this.notificationsService.createAndPush({
        company_id: event.companyId,
        sender_company_user_id: event.senderId,
        receiver_company_user_id: receiverId,
        type: NotificationTypeEnum.GENERAL,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Onboarding handoff updated',
        message:
          'A new note is available on an onboarding requirement. Open the workspace to review the next action.',
        related_module: 'onboarding',
        entity_type: 'ONBOARDING_REQUEST',
        entity_id: event.requestId,
        action_url:
          event.employeeVisible && receiverId === event.employeeMemberId
            ? '/dashboard/me/onboarding'
            : `/dashboard/employees/onboarding?request_id=${event.requestId}&handoff=${encodeURIComponent(event.requirementId)}`,
        dedupe_key: `onboarding:workspace-note:${event.noteId}:${receiverId}`,
      });
    }
  }

  @OnEvent(OnboardingTaskCompletedEvent.EVENT)
  async onOnboardingTaskCompleted(
    event: OnboardingTaskCompletedEvent,
  ): Promise<void> {
    await this.closeActionItems(
      event.companyId,
      'onboarding',
      'ONBOARDING_TASK',
      event.taskId,
    );

    const recipients = Array.from(
      new Set(
        [
          event.employeeCompanyUserId,
          event.hrCompanyUserId,
          ...(await this.resolveHrCompanyUserIds(event.companyId)),
        ].filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    );
    const taskTitle = event.taskTitle?.trim() || `Task #${event.taskId}`;
    const employeeName = event.employeeName?.trim() || 'the employee';
    const completedBy = event.completedByLabel?.trim() || 'A staff member';

    await this.sendMany(
      recipients.map((receiverCompanyUserId) => ({
        company_id: event.companyId,
        sender_company_user_id: event.completedByCompanyUserId,
        receiver_company_user_id: receiverCompanyUserId,
        type: NotificationTypeEnum.ONBOARDING_TASK_COMPLETED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Onboarding Step Completed',
        message: `${completedBy} completed "${taskTitle}" for ${employeeName}.`,
        related_module: 'onboarding',
        entity_type: 'ONBOARDING_TASK',
        entity_id: event.taskId,
        action_url: event.actionUrl ?? undefined,
        dedupe_key: `onboarding:task-completed:${event.taskId}:${receiverCompanyUserId}`,
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
          NotificationChannelEnum.SMS,
          NotificationChannelEnum.PUSH,
        ],
        metadata: {
          onboarding_request_id: event.onboardingRequestId,
          onboarding_no: event.onboardingNo,
          task_id: event.taskId,
          task_no: event.taskNo,
          employee_name: employeeName,
          completed_by: completedBy,
        },
      })),
    );
  }

  @OnEvent(OffboardingTaskCompletedEvent.EVENT)
  async onOffboardingTaskCompleted(
    event: OffboardingTaskCompletedEvent,
  ): Promise<void> {
    await this.closeActionItems(
      event.companyId,
      'offboarding',
      'OFFBOARDING_TASK',
      event.taskId,
    );
    const recipients = new Set(
      await this.resolveHrCompanyUserIds(event.companyId),
    );
    await this.sendMany(
      [...recipients].map((receiverCompanyUserId) => ({
        company_id: event.companyId,
        sender_company_user_id: event.completedByCompanyUserId,
        receiver_company_user_id: receiverCompanyUserId,
        type: NotificationTypeEnum.OFFBOARDING_TASK_COMPLETED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: 'Offboarding Checklist Item Completed',
        message: `${event.completedByLabel} completed "${event.taskTitle}" for ${event.employeeName}.`,
        related_module: 'offboarding',
        entity_type: 'OFFBOARDING_TASK',
        entity_id: event.taskId,
        action_url: `/dashboard/employees/offboarding?tab=requests&request_id=${event.offboardingRequestId}`,
        dedupe_key: `offboarding:task-completed:${event.taskId}:${receiverCompanyUserId}`,
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
          NotificationChannelEnum.SMS,
          NotificationChannelEnum.PUSH,
        ],
        metadata: {
          offboarding_request_id: event.offboardingRequestId,
          task_id: event.taskId,
          employee_name: event.employeeName,
          completed_by: event.completedByLabel,
        },
      })),
    );
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
      action_url: `/dashboard/me/requests/actions?request_id=${event.onboardingRequestId}`,
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
        action_url: `/dashboard/employees/onboarding?tab=requests&request_id=${event.onboardingRequestId}`,
        dedupe_key: `onboarding:approval-reminder:${event.approvalId}:${companyUserId}:${dayKey}`,
        metadata: {
          onboarding_request_id: event.onboardingRequestId,
          approval_level: event.approvalLevel,
          employee_name: event.employeeName,
        },
      })),
    );
  }

  @OnEvent(OnboardingDocumentReminderEvent.EVENT)
  async onOnboardingDocumentReminder(
    event: OnboardingDocumentReminderEvent,
  ): Promise<void> {
    const dayKey = new Date().toISOString().slice(0, 10);
    const labels = event.outstandingDocumentTypes.join(', ');
    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: null,
      receiver_company_user_id: event.employeeCompanyUserId,
      type: NotificationTypeEnum.ONBOARDING_DOCUMENT_REMINDER,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.MEDIUM,
      title: 'Onboarding documents need attention',
      message: `Please upload or correct these onboarding documents: ${labels}.`,
      related_module: 'onboarding',
      entity_type: 'ONBOARDING_REQUEST',
      entity_id: event.onboardingRequestId,
      action_url: `/dashboard/me/onboarding?request_id=${event.onboardingRequestId}`,
      dedupe_key: `onboarding:document-reminder:${event.onboardingRequestId}:${event.employeeCompanyUserId}:${dayKey}`,
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
      metadata: {
        onboarding_request_id: event.onboardingRequestId,
        onboarding_no: event.onboardingNo,
        outstanding_document_types: event.outstandingDocumentTypes,
      },
    });
  }

  @OnEvent(EmployeeInvitationAcceptedEvent.EVENT)
  async onEmployeeInvitationAccepted(
    event: EmployeeInvitationAcceptedEvent,
  ): Promise<void> {
    if (!event.inviterCompanyUserId) return;
    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: null,
      receiver_company_user_id: event.inviterCompanyUserId,
      type: NotificationTypeEnum.EMPLOYEE_INVITATION_ACCEPTED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.MEDIUM,
      title: 'Invitation Accepted',
      message: `${event.employeeName} accepted your invitation and has started onboarding.`,
      related_module: 'onboarding',
      entity_type: 'EMPLOYEE',
      entity_id: event.employeeId,
      action_url: event.profileUrl,
      dedupe_key: `employee-invitation:accepted:${event.invitationId}:${event.inviterCompanyUserId}`,
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
      metadata: {
        invitation_id: event.invitationId,
        employee_no: event.employeeNo,
        employee_name: event.employeeName,
      },
    });
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

    const departmentManagerIsDirectManager =
      event.departmentHeadCompanyUserId != null &&
      event.departmentHeadCompanyUserId === event.managerCompanyUserId;
    const managerRecipients = [
      ...(event.managerCompanyUserId
        ? [
            {
              id: event.managerCompanyUserId,
              title: 'Employee Onboarding Completed',
              message: `${event.employeeName}'s onboarding has been completed.`,
              key: 'manager',
            },
          ]
        : []),
      ...(event.departmentHeadCompanyUserId && !departmentManagerIsDirectManager
        ? [
            {
              id: event.departmentHeadCompanyUserId,
              title: 'New Employee in Your Department',
              message: `${event.employeeName} is now active in your department${event.departmentName ? ` (${event.departmentName})` : ''}.`,
              key: 'department-head',
            },
          ]
        : []),
    ];
    for (const recipient of managerRecipients) {
      await this.sendOne({
        company_id: event.companyId,
        sender_company_user_id: event.senderCompanyUserId,
        receiver_company_user_id: recipient.id,
        type: NotificationTypeEnum.ONBOARDING_COMPLETED,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: recipient.title,
        message: recipient.message,
        related_module: 'onboarding',
        entity_type: 'ONBOARDING_REQUEST',
        entity_id: event.onboardingRequestId,
        action_url: event.dashboardUrl,
        dedupe_key: `onboarding:completed:${recipient.key}:${event.onboardingRequestId}:${recipient.id}`,
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
          NotificationChannelEnum.SMS,
          NotificationChannelEnum.PUSH,
        ],
        metadata: {
          onboarding_no: event.onboardingNo,
          employee_name: event.employeeName,
          department_name: event.departmentName,
        },
      });
    }

    await this.closeActionItems(
      event.companyId,
      'onboarding',
      'ONBOARDING_REQUEST',
      event.onboardingRequestId,
    );
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

    for (const recipient of event.approvers) {
      if (!recipient.companyUserId) continue;
      await this.openApprovalActionItem({
        companyId: event.companyId,
        approverCompanyUserId: recipient.companyUserId,
        approverEmployeeId: recipient.employeeId,
        approverBranchId: recipient.branchId,
        approverDepartmentId: recipient.departmentId,
        sourceModule: 'offboarding',
        sourceEntityType: 'OFFBOARDING_REQUEST',
        sourceEntityId: event.offboardingRequestId,
        title: 'Offboarding approval required',
        description: `${event.employeeName}'s offboarding request needs your review.`,
        actionUrl: event.reviewUrl,
        metadata: {
          employee_name: event.employeeName,
          exit_date: event.exitDate,
        },
      });
    }

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

    for (const recipient of event.approvers) {
      if (!recipient.companyUserId) continue;
      await this.sendSms({
        code: 'offboarding.approval.required',
        module: 'offboarding',
        recipientCompanyUserId: recipient.companyUserId,
        relatedEntityType: 'OFFBOARDING_REQUEST',
        relatedEntityId: event.offboardingRequestId,
        variables: {
          employee_name: event.employeeName,
          exit_date: event.exitDate,
        },
      });
    }

    for (const recipient of event.approvers) {
      if (!recipient.companyUserId) continue;
      await this.openApprovalActionItem({
        companyId: event.companyId,
        approverCompanyUserId: recipient.companyUserId,
        approverEmployeeId: recipient.employeeId,
        approverBranchId: recipient.branchId,
        approverDepartmentId: recipient.departmentId,
        sourceModule: 'offboarding',
        sourceEntityType: 'OFFBOARDING_REQUEST',
        sourceEntityId: event.offboardingRequestId,
        title: 'Offboarding approval required',
        description: `${event.employeeName}'s offboarding request is waiting for your action.`,
        actionUrl: event.reviewUrl,
        metadata: {
          employee_name: event.employeeName,
          exit_date: event.exitDate,
        },
      });
    }
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

    await this.closeActionItems(
      event.companyId,
      'offboarding',
      'OFFBOARDING_REQUEST',
      event.offboardingRequestId,
    );
  }

  @OnEvent(OffboardingRejectedEvent.EVENT)
  async onOffboardingRejected(event: OffboardingRejectedEvent): Promise<void> {
    if (!event.employeeCompanyUserId) return;
    await this.sendOne({
      company_id: event.companyId,
      sender_company_user_id: null,
      receiver_company_user_id: event.employeeCompanyUserId,
      type: NotificationTypeEnum.OFFBOARDING_REJECTED,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.MEDIUM,
      title: 'Offboarding Request Declined',
      message: event.reason
        ? `Your offboarding request was declined. Reason: ${event.reason}`
        : 'Your offboarding request was declined. Contact HR for next steps.',
      related_module: 'offboarding',
      entity_type: 'OFFBOARDING_REQUEST',
      entity_id: event.offboardingRequestId,
      action_url: event.dashboardUrl,
      dedupe_key: `offboarding:rejected:employee:${event.offboardingRequestId}:${event.employeeCompanyUserId}`,
      metadata: { exit_date: event.exitDate, reason: event.reason },
    });
  }

  @OnEvent(OffboardingTaskAssignedEvent.EVENT)
  async onOffboardingTaskAssigned(
    event: OffboardingTaskAssignedEvent,
  ): Promise<void> {
    if (!event.assigneeCompanyUserId) {
      return;
    }

    try {
      await this.actionItemsService.upsertOpen({
        companyId: event.companyId,
        assigneeCompanyUserId: event.assigneeCompanyUserId,
        actionType: ActionItemTypeEnum.TASK,
        sourceModule: 'offboarding',
        sourceEntityType: 'OFFBOARDING_TASK',
        sourceEntityId: event.taskId,
        sourceKey: `offboarding:task:${event.taskId}:${event.assigneeCompanyUserId}`,
        title: event.taskTitle,
        priority: 'HIGH',
        actionUrl: event.taskUrl,
        dueAt: event.dueDate,
        metadata: {
          offboarding_request_id: event.offboardingRequestId,
          employee_name: event.employeeName,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to open offboarding task action item',
        error instanceof Error ? error.stack : String(error),
      );
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

    await this.sendSms({
      code: 'offboarding.approval.reminder',
      module: 'offboarding',
      recipientCompanyUserId: event.approverCompanyUserId,
      relatedEntityType: 'OFFBOARDING_APPROVAL',
      relatedEntityId: event.approvalId,
      variables: {
        employee_name: event.employeeName,
        approval_level: event.approvalLevel,
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

    try {
      await this.actionItemsService.upsertOpen({
        companyId: event.companyId,
        assigneeCompanyUserId: event.ownerCompanyUserId,
        actionType: ActionItemTypeEnum.CLEARANCE,
        sourceModule: 'offboarding',
        sourceEntityType: 'OFFBOARDING_CLEARANCE',
        sourceEntityId: event.clearanceId,
        sourceKey: `offboarding:clearance:${event.clearanceId}:${event.ownerCompanyUserId}`,
        title: `${event.clearanceType} clearance required`,
        priority: 'HIGH',
        actionUrl: event.clearanceUrl,
        metadata: {
          employee_name: event.employeeName,
          clearance_type: event.clearanceType,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to open offboarding clearance action item',
        error instanceof Error ? error.stack : String(error),
      );
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

  @OnEvent(OffboardingAssetOverdueEvent.EVENT)
  async onOffboardingAssetOverdue(
    event: OffboardingAssetOverdueEvent,
  ): Promise<void> {
    if (!event.ownerCompanyUserId) {
      return;
    }

    const dayKey = new Date().toISOString().slice(0, 10);

    await this.sendOne({
      company_id: event.companyId,
      receiver_company_user_id: event.ownerCompanyUserId,
      type: NotificationTypeEnum.OFFBOARDING_ASSET_OVERDUE,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Offboarding Asset Return Overdue',
      message: `The asset return "${event.assetLabel}" for ${event.employeeName} is overdue.`,
      related_module: 'offboarding',
      entity_type: 'OFFBOARDING_ASSET_RETURN',
      entity_id: event.assetReturnId,
      action_url: event.assetUrl,
      dedupe_key: `offboarding:asset-overdue:${event.assetReturnId}:${event.ownerCompanyUserId}:${dayKey}`,
      metadata: {
        offboarding_request_id: event.offboardingRequestId,
        employee_name: event.employeeName,
        asset_label: event.assetLabel,
        exit_date: event.exitDate,
        due_date: event.dueDate,
      },
    });

    await this.sendSms({
      code: 'offboarding.asset.overdue',
      module: 'offboarding',
      recipientCompanyUserId: event.ownerCompanyUserId,
      relatedEntityType: 'OFFBOARDING_ASSET_RETURN',
      relatedEntityId: event.assetReturnId,
      variables: {
        employee_name: event.employeeName,
        asset_label: event.assetLabel,
        exit_date: event.exitDate,
        due_date: event.dueDate,
      },
    });
  }

  @OnEvent(OffboardingSettlementOverdueEvent.EVENT)
  async onOffboardingSettlementOverdue(
    event: OffboardingSettlementOverdueEvent,
  ): Promise<void> {
    if (!event.ownerCompanyUserId) {
      return;
    }

    const dayKey = new Date().toISOString().slice(0, 10);

    await this.sendOne({
      company_id: event.companyId,
      receiver_company_user_id: event.ownerCompanyUserId,
      type: NotificationTypeEnum.OFFBOARDING_SETTLEMENT_OVERDUE,
      category: NotificationCategoryEnum.HR,
      priority: NotificationPriorityEnum.HIGH,
      title: 'Offboarding Settlement Overdue',
      message: `The settlement item "${event.settlementTitle}" for ${event.employeeName} is overdue.`,
      related_module: 'offboarding',
      entity_type: 'OFFBOARDING_SETTLEMENT_ITEM',
      entity_id: event.settlementItemId,
      action_url: event.settlementUrl,
      dedupe_key: `offboarding:settlement-overdue:${event.settlementItemId}:${event.ownerCompanyUserId}:${dayKey}`,
      metadata: {
        offboarding_request_id: event.offboardingRequestId,
        employee_name: event.employeeName,
        settlement_title: event.settlementTitle,
        exit_date: event.exitDate,
        due_date: event.dueDate,
      },
    });

    await this.sendSms({
      code: 'offboarding.settlement.overdue',
      module: 'offboarding',
      recipientCompanyUserId: event.ownerCompanyUserId,
      relatedEntityType: 'OFFBOARDING_SETTLEMENT_ITEM',
      relatedEntityId: event.settlementItemId,
      variables: {
        employee_name: event.employeeName,
        settlement_title: event.settlementTitle,
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

    await this.closeActionItems(
      event.companyId,
      'offboarding',
      'OFFBOARDING_REQUEST',
      event.offboardingRequestId,
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

  private sendSms(input: {
    code: string;
    module: string;
    recipientCompanyUserId?: number | null;
    relatedEntityType?: string | null;
    relatedEntityId?: string | number | null;
    variables?: Record<string, unknown>;
  }): Promise<void> {
    void this.notificationQueueService.enqueueSmsConfiguredNotification({
      code: input.code,
      module: input.module,
      recipientCompanyUserId: input.recipientCompanyUserId ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      variables: input.variables,
    });
    return Promise.resolve();
  }
}
