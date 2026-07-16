import { NotificationsService } from '../../notifications/notifications.service';
import { HrInAppNotificationListener } from './hr-in-app-notification.listener';
import { LeaveSubmittedEvent, OnboardingApprovalReminderEvent } from './events';

describe('HrInAppNotificationListener', () => {
  let listener: HrInAppNotificationListener;
  let notificationsService: {
    createAndPush: jest.Mock;
    createAndPushMany: jest.Mock;
  };

  beforeEach(() => {
    notificationsService = {
      createAndPush: jest.fn().mockResolvedValue(undefined),
      createAndPushMany: jest.fn().mockResolvedValue(undefined),
    };

    listener = new HrInAppNotificationListener(
      notificationsService as unknown as NotificationsService,
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
});
