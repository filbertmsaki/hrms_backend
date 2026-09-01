import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import {
  LeaveApprovedEvent,
  OffboardingAssetOverdueEvent,
  OffboardingClearanceRequiredEvent,
  OffboardingSettlementOverdueEvent,
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

  it('sends support escalations to Alliance IT mailboxes', async () => {
    await service.sendSupportEscalationEmail({
      to: ['filbert@alliance.co.tz', 'inocent@alliance.co.tz'],
      ticketId: 'IT-TEST',
      summary: 'Cannot find payroll',
      transcript: 'User: payroll\nAssistant: Open Payroll',
      requesterEmail: 'kelvin@alliance.co.tz',
      requesterName: 'kelvin@alliance.co.tz',
    });

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'filbert@alliance.co.tz, inocent@alliance.co.tz',
        subject: 'HRMS support ticket IT-TEST',
        mailSafetyContext: {
          sourceModule: 'Support.escalate',
        },
      }),
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
      12,
      1,
      2,
      3,
    );

    await service.sendLeaveApprovedNotification(event.employeeEmail, event);

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'amina@example.com',
        template: 'hr-leave-approved',
        mailSafetyContext: {
          sourceModule: 'HrNotificationListener.sendLeaveApprovedNotification',
        },
        context: expect.objectContaining({
          employeeName: 'Amina John',
          leaveTypeName: 'Annual Leave',
          dashboardUrl: 'http://localhost:5173/leave/12',
          appName: 'HRMS',
        }) as unknown,
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
      1,
      15,
      20,
      30,
      40,
      'ONB-TASK-001',
    );

    await service.sendOnboardingTaskAssignedNotification(
      event.assigneeEmail,
      event,
    );

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'neema@example.com',
        template: 'hr-onboarding-task-assigned',
        mailSafetyContext: {
          sourceModule:
            'HrNotificationListener.sendOnboardingTaskAssignedNotification',
        },
        context: expect.objectContaining({
          assigneeName: 'Neema Manager',
          employeeName: 'Amina John',
          taskTitle: 'Prepare laptop',
          taskUrl: 'http://localhost:5173/onboarding/15/tasks',
        }) as unknown,
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
      1,
      4,
      7,
      12,
      14,
    );

    await service.sendOffboardingClearanceRequiredNotification(
      event.ownerEmail,
      event,
    );

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'john@example.com',
        template: 'hr-offboarding-clearance-required',
        mailSafetyContext: {
          sourceModule:
            'HrNotificationListener.sendOffboardingClearanceRequiredNotification',
        },
        context: expect.objectContaining({
          ownerName: 'John HR',
          employeeName: 'Amina John',
          clearanceType: 'system_access',
          clearanceUrl: 'http://localhost:5173/offboarding/4/clearances',
        }) as unknown,
      }),
    );
  });

  it('sends the offboarding asset-overdue template using owner data from the event', async () => {
    const event = new OffboardingAssetOverdueEvent(
      1,
      4,
      15,
      'Dell Latitude 5440',
      'Amina John',
      7,
      'John HR',
      'john@example.com',
      new Date('2026-08-01T09:00:00.000Z'),
      '2026-08-05',
      'http://localhost:5173/offboarding/4/assets',
    );

    await service.sendOffboardingAssetOverdueNotification(
      event.ownerEmail!,
      event,
    );

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'john@example.com',
        template: 'hr-offboarding-asset-overdue',
        mailSafetyContext: {
          sourceModule:
            'HrNotificationListener.sendOffboardingAssetOverdueNotification',
        },
        context: expect.objectContaining({
          ownerName: 'John HR',
          employeeName: 'Amina John',
          assetLabel: 'Dell Latitude 5440',
          assetUrl: 'http://localhost:5173/offboarding/4/assets',
        }) as unknown,
      }),
    );
  });

  it('sends the offboarding settlement-overdue template using owner data from the event', async () => {
    const event = new OffboardingSettlementOverdueEvent(
      1,
      4,
      16,
      'Laptop replacement deduction',
      'Amina John',
      8,
      'Jane Finance',
      'finance@example.com',
      new Date('2026-08-02T09:00:00.000Z'),
      '2026-08-05',
      'http://localhost:5173/offboarding/4/settlements',
    );

    await service.sendOffboardingSettlementOverdueNotification(
      event.ownerEmail!,
      event,
    );

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'finance@example.com',
        template: 'hr-offboarding-settlement-overdue',
        mailSafetyContext: {
          sourceModule:
            'HrNotificationListener.sendOffboardingSettlementOverdueNotification',
        },
        context: expect.objectContaining({
          ownerName: 'Jane Finance',
          employeeName: 'Amina John',
          settlementTitle: 'Laptop replacement deduction',
          settlementUrl: 'http://localhost:5173/offboarding/4/settlements',
        }) as unknown,
      }),
    );
  });
});
