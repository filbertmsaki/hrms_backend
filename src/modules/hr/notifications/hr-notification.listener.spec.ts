import { HrNotificationListener } from './hr-notification.listener';
import { MailService } from '../../mail/mail.service';
import {
  LeaveApprovedEvent,
  OffboardingApprovedEvent,
  OnboardingTaskAssignedEvent,
} from './events';

describe('HrNotificationListener', () => {
  let listener: HrNotificationListener;
  let mailService: jest.Mocked<Partial<MailService>>;

  beforeEach(() => {
    mailService = {
      sendLeaveApprovedNotification: jest.fn().mockResolvedValue(undefined),
      sendOffboardingApprovedNotification: jest
        .fn()
        .mockResolvedValue(undefined),
      sendOnboardingTaskAssignedNotification: jest
        .fn()
        .mockResolvedValue(undefined),
    };

    listener = new HrNotificationListener(mailService as MailService);
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
    );

    await listener.onOffboardingApproved(event);

    expect(mailService.sendOffboardingApprovedNotification).toHaveBeenCalledTimes(
      3,
    );
    expect(mailService.sendOffboardingApprovedNotification).toHaveBeenNthCalledWith(
      1,
      'amina@example.com',
      'Amina John',
      event,
    );
    expect(mailService.sendOffboardingApprovedNotification).toHaveBeenNthCalledWith(
      2,
      'hr1@example.com',
      'HR One',
      event,
    );
    expect(mailService.sendOffboardingApprovedNotification).toHaveBeenNthCalledWith(
      3,
      'hr2@example.com',
      'HR Two',
      event,
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
    );

    await listener.onOnboardingTaskAssigned(event);

    expect(
      mailService.sendOnboardingTaskAssignedNotification,
    ).toHaveBeenCalledWith('neema@example.com', event);
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
    );

    await expect(listener.onLeaveApproved(event)).resolves.toBeUndefined();
  });
});
