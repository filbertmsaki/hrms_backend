import { Logger } from '@nestjs/common';
import { HrNotificationListener } from './hr-notification.listener';
import { NotificationQueueService } from '../../notifications/notification-queue.service';
import {
  LeaveApprovedEvent,
  OffboardingApprovedEvent,
  OffboardingAssetOverdueEvent,
  OnboardingTaskAssignedEvent,
  OffboardingSettlementOverdueEvent,
} from './events';

describe('HrNotificationListener', () => {
  let listener: HrNotificationListener;
  let notificationQueueService: {
    enqueueMailMethod: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    notificationQueueService = {
      enqueueMailMethod: jest.fn().mockResolvedValue(undefined),
    };
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    listener = new HrNotificationListener(
      notificationQueueService as unknown as NotificationQueueService,
    );
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('fans out offboarding-approved emails to the employee and HR recipients', async () => {
    const event = new OffboardingApprovedEvent(
      'Amina John',
      'amina@example.com',
      '2026-06-30',
      [
        { name: 'HR One', email: 'hr1@example.com' },
        { name: 'HR Two', email: 'hr2@example.com' },
      ],
      'http://localhost:5173/offboarding/8',
      8,
      1,
      2,
      3,
    );

    await listener.onOffboardingApproved(event);

    expect(notificationQueueService.enqueueMailMethod).toHaveBeenCalledTimes(3);
    expect(notificationQueueService.enqueueMailMethod).toHaveBeenNthCalledWith(
      1,
      'sendOffboardingApprovedNotification',
      ['amina@example.com', 'Amina John', event],
    );
    expect(notificationQueueService.enqueueMailMethod).toHaveBeenNthCalledWith(
      2,
      'sendOffboardingApprovedNotification',
      ['hr1@example.com', 'HR One', event],
    );
    expect(notificationQueueService.enqueueMailMethod).toHaveBeenNthCalledWith(
      3,
      'sendOffboardingApprovedNotification',
      ['hr2@example.com', 'HR Two', event],
    );
  });

  it('passes the task-assigned event directly to the mail service', async () => {
    const event = new OnboardingTaskAssignedEvent(
      'Neema Manager',
      'neema@example.com',
      'Amina John',
      'Prepare laptop',
      null,
      null,
      'http://localhost:5173/onboarding/15/tasks',
      1,
      15,
      20,
      30,
      40,
      'ONB-TASK-001',
    );

    await listener.onOnboardingTaskAssigned(event);

    expect(notificationQueueService.enqueueMailMethod).toHaveBeenCalledWith(
      'sendOnboardingTaskAssignedNotification',
      ['neema@example.com', event],
    );
  });

  it('sends overdue offboarding asset-return emails to the owner', async () => {
    const event = new OffboardingAssetOverdueEvent(
      1,
      8,
      22,
      'Dell Latitude 5440',
      'Amina John',
      14,
      'John HR',
      'john@example.com',
      new Date('2026-08-01T09:00:00.000Z'),
      '2026-08-05',
      'http://localhost:5173/offboarding/8/assets',
    );

    await listener.onOffboardingAssetOverdue(event);

    expect(notificationQueueService.enqueueMailMethod).toHaveBeenCalledWith(
      'sendOffboardingAssetOverdueNotification',
      ['john@example.com', event],
    );
  });

  it('sends overdue offboarding settlement emails to the owner', async () => {
    const event = new OffboardingSettlementOverdueEvent(
      1,
      8,
      31,
      'Laptop replacement deduction',
      'Amina John',
      15,
      'Jane Finance',
      'finance@example.com',
      new Date('2026-08-02T09:00:00.000Z'),
      '2026-08-05',
      'http://localhost:5173/offboarding/8/settlements',
    );

    await listener.onOffboardingSettlementOverdue(event);

    expect(notificationQueueService.enqueueMailMethod).toHaveBeenCalledWith(
      'sendOffboardingSettlementOverdueNotification',
      ['finance@example.com', event],
    );
  });

  it('swallows mail errors and does not throw from event handlers', async () => {
    notificationQueueService.enqueueMailMethod.mockRejectedValue(
      new Error('mail failed'),
    );

    const event = new LeaveApprovedEvent(
      'Amina John',
      'amina@example.com',
      'Annual Leave',
      '2026-06-24',
      '2026-06-28',
      5,
      'http://localhost:5173/leave/12',
      12,
      1,
      2,
      3,
    );

    await expect(listener.onLeaveApproved(event)).resolves.toBeUndefined();
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'HR notification email failed',
      expect.stringContaining('Error: mail failed'),
    );
  });
});
