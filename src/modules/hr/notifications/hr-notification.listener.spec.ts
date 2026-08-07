import { Logger } from '@nestjs/common';
import { HrNotificationListener } from './hr-notification.listener';
import { MailService } from '../../mail/mail.service';
import {
  LeaveApprovedEvent,
  OffboardingApprovedEvent,
  OffboardingAssetOverdueEvent,
  OnboardingTaskAssignedEvent,
  OffboardingSettlementOverdueEvent,
} from './events';

describe('HrNotificationListener', () => {
  let listener: HrNotificationListener;
  let mailService: jest.Mocked<Partial<MailService>>;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mailService = {
      sendLeaveApprovedNotification: jest.fn().mockResolvedValue(undefined),
      sendOffboardingApprovedNotification: jest
        .fn()
        .mockResolvedValue(undefined),
      sendOffboardingAssetOverdueNotification: jest
        .fn()
        .mockResolvedValue(undefined),
      sendOffboardingSettlementOverdueNotification: jest
        .fn()
        .mockResolvedValue(undefined),
      sendOnboardingTaskAssignedNotification: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    listener = new HrNotificationListener(mailService as MailService);
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

    expect(
      mailService.sendOffboardingApprovedNotification,
    ).toHaveBeenCalledTimes(3);
    expect(
      mailService.sendOffboardingApprovedNotification,
    ).toHaveBeenNthCalledWith(1, 'amina@example.com', 'Amina John', event);
    expect(
      mailService.sendOffboardingApprovedNotification,
    ).toHaveBeenNthCalledWith(2, 'hr1@example.com', 'HR One', event);
    expect(
      mailService.sendOffboardingApprovedNotification,
    ).toHaveBeenNthCalledWith(3, 'hr2@example.com', 'HR Two', event);
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

    expect(
      mailService.sendOnboardingTaskAssignedNotification,
    ).toHaveBeenCalledWith('neema@example.com', event);
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

    expect(
      mailService.sendOffboardingAssetOverdueNotification,
    ).toHaveBeenCalledWith('john@example.com', event);
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

    expect(
      mailService.sendOffboardingSettlementOverdueNotification,
    ).toHaveBeenCalledWith('finance@example.com', event);
  });

  it('swallows mail errors and does not throw from event handlers', async () => {
    mailService.sendLeaveApprovedNotification = jest
      .fn()
      .mockRejectedValue(new Error('mail failed'));

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
