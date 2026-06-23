import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import {
  LeaveApprovedEvent,
  OffboardingClearanceRequiredEvent,
  OnboardingTaskAssignedEvent,
} from '../hr/notifications/events';

describe('MailService', () => {
  let service: MailService;
  let mailerService: { sendMail: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    mailerService = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          APP_NAME: 'HRMS',
          SUPPORT_EMAIL: 'support@example.com',
          APP_FRONTEND_URL: 'http://localhost:5173',
        };
        return values[key];
      }),
    };

    service = new MailService(
      mailerService as unknown as MailerService,
      configService as unknown as ConfigService,
    );
  });

  it('sends the leave-approved template with the event payload', async () => {
    const event = new LeaveApprovedEvent(
      'Amina John',
      'amina@example.com',
      'Annual Leave',
      '2026-06-24',
      '2026-06-28',
      5,
      'http://localhost:5173/leave/12',
    );

    await service.sendLeaveApprovedNotification(event.employeeEmail, event);

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'amina@example.com',
        template: 'hr-leave-approved',
        context: expect.objectContaining({
          employeeName: 'Amina John',
          leaveTypeName: 'Annual Leave',
          dashboardUrl: 'http://localhost:5173/leave/12',
          appName: 'HRMS',
        }),
      }),
    );
  });

  it('sends the onboarding task-assigned template using assignee data from the event', async () => {
    const event = new OnboardingTaskAssignedEvent(
      'Neema Manager',
      'neema@example.com',
      'Amina John',
      'Prepare laptop',
      'Install required tools',
      new Date('2026-06-25T09:00:00.000Z'),
      'http://localhost:5173/onboarding/15/tasks',
    );

    await service.sendOnboardingTaskAssignedNotification(
      event.assigneeEmail,
      event,
    );

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'neema@example.com',
        template: 'hr-onboarding-task-assigned',
        context: expect.objectContaining({
          assigneeName: 'Neema Manager',
          employeeName: 'Amina John',
          taskTitle: 'Prepare laptop',
          taskUrl: 'http://localhost:5173/onboarding/15/tasks',
        }),
      }),
    );
  });

  it('sends the offboarding clearance-required template using owner data from the event', async () => {
    const event = new OffboardingClearanceRequiredEvent(
      'John HR',
      'john@example.com',
      'Amina John',
      'system_access',
      '2026-06-30',
      'http://localhost:5173/offboarding/4/clearances',
    );

    await service.sendOffboardingClearanceRequiredNotification(
      event.ownerEmail,
      event,
    );

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'john@example.com',
        template: 'hr-offboarding-clearance-required',
        context: expect.objectContaining({
          ownerName: 'John HR',
          employeeName: 'Amina John',
          clearanceType: 'system_access',
          clearanceUrl: 'http://localhost:5173/offboarding/4/clearances',
        }),
      }),
    );
  });
});
