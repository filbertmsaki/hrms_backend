import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationQueueService } from '../../notifications/notification-queue.service';
import { SmsNotificationManagementService } from '../../sms/sms-notification-management.service';
import { HrInAppNotificationListener } from './hr-in-app-notification.listener';
import {
  EmployeeInvitationAcceptedEvent,
  LeaveSubmittedEvent,
  OffboardingAssetOverdueEvent,
  OffboardingSettlementOverdueEvent,
  OnboardingApprovalReminderEvent,
  OnboardingTaskAssignedEvent,
} from './events';
import type { ActionItemsService } from '../action-inbox/action-items.service';

describe('HrInAppNotificationListener', () => {
  let listener: HrInAppNotificationListener;
  let notificationsService: {
    createAndPush: jest.Mock;
    createAndPushMany: jest.Mock;
  };
  let actionItemsService: {
    upsertOpen: jest.Mock;
    completeAllOpenForEntity: jest.Mock;
  };
  let smsNotificationManagementService: {
    sendConfiguredNotification: jest.Mock;
  };
  let notificationQueueService: {
    enqueueSmsConfiguredNotification: jest.Mock;
  };

  beforeEach(() => {
    notificationsService = {
      createAndPush: jest.fn().mockResolvedValue(undefined),
      createAndPushMany: jest.fn().mockResolvedValue(undefined),
    };
    actionItemsService = {
      upsertOpen: jest.fn().mockResolvedValue(undefined),
      completeAllOpenForEntity: jest.fn().mockResolvedValue(undefined),
    };
    smsNotificationManagementService = {
      sendConfiguredNotification: jest.fn(),
    };
    notificationQueueService = {
      enqueueSmsConfiguredNotification: jest.fn().mockResolvedValue(undefined),
    };

    listener = new HrInAppNotificationListener(
      notificationsService as unknown as NotificationsService,
      actionItemsService as unknown as ActionItemsService,
      smsNotificationManagementService as unknown as SmsNotificationManagementService,
      notificationQueueService as unknown as NotificationQueueService,
    );
  });

  it('creates approver and employee in-app notifications for leave submission', async () => {
    const event = new LeaveSubmittedEvent(
      10,
      'Amina John',
      'amina@example.com',
      'Annual Leave',
      '2026-07-20',
      '2026-07-24',
      5,
      'Family travel',
      [{ companyUserId: 44, name: 'Manager', email: 'manager@example.com' }],
      'http://localhost:5173/leave/99/review',
      99,
      33,
      55,
    );

    await listener.onLeaveSubmitted(event);

    expect(notificationsService.createAndPush).toHaveBeenCalledTimes(2);
    expect(notificationsService.createAndPush).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        company_id: 10,
        sender_company_user_id: 33,
        receiver_company_user_id: 44,
        entity_id: 99,
        dedupe_key: 'leave:submitted:approver:99:44',
      }),
    );
    expect(notificationsService.createAndPush).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        company_id: 10,
        sender_company_user_id: 33,
        receiver_company_user_id: 55,
        entity_id: 99,
        dedupe_key: 'leave:submitted:employee:99:55',
      }),
    );
  });

  it('creates reminder notifications for each stale onboarding approver', async () => {
    const event = new OnboardingApprovalReminderEvent(
      22,
      301,
      401,
      2,
      'Neema David',
      [91, 92],
    );

    await listener.onOnboardingApprovalReminder(event);

    expect(notificationsService.createAndPush).toHaveBeenCalledTimes(2);
    expect(notificationsService.createAndPush).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        company_id: 22,
        receiver_company_user_id: 91,
        entity_id: 401,
      }),
    );
    expect(notificationsService.createAndPush).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        company_id: 22,
        receiver_company_user_id: 92,
        entity_id: 401,
      }),
    );
  });

  it('creates in-app notifications for overdue offboarding asset returns', async () => {
    const event = new OffboardingAssetOverdueEvent(
      10,
      99,
      501,
      'Dell Latitude 5440',
      'Amina John',
      44,
      'John HR',
      'john@example.com',
      new Date('2026-08-01T09:00:00.000Z'),
      '2026-08-05',
      '/offboarding/99/assets',
    );

    await listener.onOffboardingAssetOverdue(event);

    expect(notificationsService.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 10,
        receiver_company_user_id: 44,
        type: 'OFFBOARDING_ASSET_OVERDUE',
        entity_type: 'OFFBOARDING_ASSET_RETURN',
        entity_id: 501,
        action_url: '/offboarding/99/assets',
      }),
    );
  });

  it('creates in-app notifications for overdue offboarding settlement items', async () => {
    const event = new OffboardingSettlementOverdueEvent(
      10,
      99,
      601,
      'Laptop replacement deduction',
      'Amina John',
      55,
      'Jane Finance',
      'finance@example.com',
      new Date('2026-08-02T09:00:00.000Z'),
      '2026-08-05',
      '/offboarding/99/settlements',
    );

    await listener.onOffboardingSettlementOverdue(event);

    expect(notificationsService.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 10,
        receiver_company_user_id: 55,
        type: 'OFFBOARDING_SETTLEMENT_OVERDUE',
        entity_type: 'OFFBOARDING_SETTLEMENT_ITEM',
        entity_id: 601,
        action_url: '/offboarding/99/settlements',
      }),
    );
  });

  it('creates an action item and sends onboarding assignments through every supported channel', async () => {
    const event = new OnboardingTaskAssignedEvent(
      'Neema Manager',
      'neema@example.com',
      'Amina John',
      'Prepare laptop',
      'Install required tools',
      new Date('2026-06-25T09:00:00.000Z'),
      'http://localhost:5173/dashboard/me/requests/actions',
      1,
      15,
      20,
      30,
      40,
      'ONB-TASK-001',
    );

    await listener.onOnboardingTaskAssigned(event);

    expect(actionItemsService.upsertOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeCompanyUserId: 30,
        sourceEntityType: 'ONBOARDING_TASK',
        sourceEntityId: 20,
        title: 'Prepare laptop',
      }),
    );
    expect(notificationsService.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver_company_user_id: 30,
        type: 'ONBOARDING_TASK_ASSIGNED',
        action_url: 'http://localhost:5173/dashboard/me/requests/actions',
        channels: ['IN_APP', 'EMAIL', 'SMS'],
      }),
    );
  });

  it('notifies the invitation owner in-app and by email when an invitee accepts', async () => {
    await listener.onEmployeeInvitationAccepted(
      new EmployeeInvitationAcceptedEvent(
        10,
        44,
        91,
        'AICL/091',
        'Amina Moshi',
        20,
        'https://hrms.example.com/dashboard/employees/profile/AICL%2F091',
      ),
    );

    expect(notificationsService.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 10,
        receiver_company_user_id: 20,
        type: 'EMPLOYEE_INVITATION_ACCEPTED',
        title: 'Invitation Accepted',
        message:
          'Amina Moshi accepted your invitation and has started onboarding.',
        entity_type: 'EMPLOYEE',
        entity_id: 91,
        action_url:
          'https://hrms.example.com/dashboard/employees/profile/AICL%2F091',
        dedupe_key: 'employee-invitation:accepted:44:20',
        channels: ['IN_APP', 'EMAIL'],
      }),
    );
  });

  it('skips the acceptance notification when the invitation has no owner', async () => {
    await listener.onEmployeeInvitationAccepted(
      new EmployeeInvitationAcceptedEvent(10, 44, 91, null, 'A B', null, null),
    );
    expect(notificationsService.createAndPush).not.toHaveBeenCalled();
  });
});
