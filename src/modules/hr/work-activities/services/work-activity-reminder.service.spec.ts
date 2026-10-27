import 'reflect-metadata';
import { WorkActivityReminderService } from './work-activity-reminder.service';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';

describe('WorkActivityReminderService', () => {
  const notificationSink = new Map<string, Record<string, unknown>>();
  const configService = {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  };
  const actionItemsService = {
    cancelBySource: jest.fn().mockResolvedValue(undefined),
    cancelBySourcePrefix: jest.fn().mockResolvedValue(undefined),
    upsertOpen: jest.fn(async (input: Record<string, unknown>) => {
      // Mirrors the action inbox's unique company/assignee/sourceKey contract.
      const key = [
        input.companyId,
        input.assigneeCompanyUserId,
        input.sourceKey,
      ]
        .map(String)
        .join(':');
      notificationSink.set(key, input);
      return input;
    }),
  };
  const activityPolicyService = {
    resolveForEmployee: jest.fn().mockResolvedValue({
      dailySubmissionRequired: true,
      submissionTimezone: 'Africa/Dar_es_Salaam',
      submissionCutoffTime: '20:00',
      managerReviewDueHours: 24,
      departmentHeadEscalationEnabled: false,
      departmentHeadEscalationHours: 48,
    }),
  };
  const eligibilityService = {
    evaluate: jest.fn().mockResolvedValue({
      eligible: true,
      isWorkday: false,
      isOffDay: true,
      isHoliday: false,
      hasApprovedLeave: false,
      scheduleSource: 'PUBLISHED_EMPLOYEE_SCHEDULE',
      timezone: 'Africa/Dar_es_Salaam',
    }),
  };
  const employeeRepository = { find: jest.fn(), findOne: jest.fn() };
  const departmentRepository = { findOne: jest.fn() };
  const reportRepository = { find: jest.fn(), findOne: jest.fn() };
  const visitRepository = { find: jest.fn() };
  const followUpRepository = { find: jest.fn() };
  let service: WorkActivityReminderService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-10T18:00:00.000Z'));
    jest.clearAllMocks();
    notificationSink.clear();
    activityPolicyService.resolveForEmployee.mockResolvedValue({
      dailySubmissionRequired: true,
      submissionTimezone: 'Africa/Dar_es_Salaam',
      submissionCutoffTime: '20:00',
      managerReviewDueHours: 24,
      departmentHeadEscalationEnabled: false,
      departmentHeadEscalationHours: 48,
    });
    employeeRepository.find.mockResolvedValue([
      {
        id: 10,
        company_id: 3,
        company_user_id: 20,
        employee_no: 'UAT-10',
        first_name: 'Test',
        last_name: 'Employee',
        primary_branch_id: 1,
        primary_department_id: 2,
        primary_position_id: 3,
        grade_id: null,
        employment_type: 'full_time',
        employment_status: EmploymentStatusEnum.ACTIVE,
        hire_date: '2026-01-01',
        exit_date: null,
        reports_to: 11,
      },
    ]);
    reportRepository.findOne.mockResolvedValue(null);
    reportRepository.find.mockResolvedValue([]);
    visitRepository.find.mockResolvedValue([]);
    followUpRepository.find.mockResolvedValue([]);
    employeeRepository.findOne.mockImplementation(
      async (options: { where: { id: number } }) => {
        if (options.where.id === 11) {
          return { id: 11, company_id: 3, company_user_id: 21 };
        }
        if (options.where.id === 12) {
          return { id: 12, company_id: 3, company_user_id: 22 };
        }
        return null;
      },
    );
    departmentRepository.findOne.mockResolvedValue({ manager_employee_id: 12 });
    service = new WorkActivityReminderService(
      configService as never,
      actionItemsService as never,
      activityPolicyService as never,
      eligibilityService as never,
      employeeRepository as never,
      departmentRepository as never,
      reportRepository as never,
      visitRepository as never,
      followUpRepository as never,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('runs the scheduled reminder in the configured local timezone', async () => {
    const cronMetadata = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      WorkActivityReminderService.prototype.sendSubmissionReminders,
    );
    expect(cronMetadata.cronTime).toBe('0 */15 * * * *');

    await service.sendSubmissionReminders();

    expect(eligibilityService.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10 }),
      '2026-06-10', // 21:00 in Dar es Salaam, after the 20:00 cutoff.
      'Africa/Dar_es_Salaam',
    );
    expect(actionItemsService.upsertOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKey: 'daily-activity:missing:10:2026-06-10',
        metadata: expect.objectContaining({
          isWorkday: false,
          isOffDay: true,
          timezone: 'Africa/Dar_es_Salaam',
        }),
      }),
      { reopenCompleted: false },
    );
  });

  it('retries idempotently through the notification sink without duplicate reminders', async () => {
    await service.sendSubmissionReminders();
    await service.sendSubmissionReminders();

    expect(actionItemsService.upsertOpen).toHaveBeenCalledTimes(2);
    expect(notificationSink.size).toBe(1);
  });

  it('waits for each employee local cutoff before creating a reminder', async () => {
    jest.setSystemTime(new Date('2026-06-10T12:00:00.000Z'));

    const created = await service.sendSubmissionReminders();

    expect(created).toBe(0);
    expect(actionItemsService.upsertOpen).not.toHaveBeenCalled();
  });

  it('cancels a missing-report reminder if submission lands before the action is queued', async () => {
    reportRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'SUBMITTED' });

    await service.sendSubmissionReminders();

    expect(actionItemsService.upsertOpen).not.toHaveBeenCalled();
    expect(actionItemsService.cancelBySource).toHaveBeenCalledWith(
      3,
      'daily-activity:missing:10:2026-06-10',
    );
  });

  it('keeps missing-report reminders with the employee and cancels manager escalations', async () => {
    activityPolicyService.resolveForEmployee.mockResolvedValue({
      dailySubmissionRequired: true,
      submissionTimezone: 'Africa/Dar_es_Salaam',
      submissionCutoffTime: '20:00',
      managerReviewDueHours: 24,
      departmentHeadEscalationEnabled: true,
      departmentHeadEscalationHours: 48,
    });

    await service.sendReviewAndFollowUpReminders();

    expect(actionItemsService.upsertOpen).not.toHaveBeenCalled();
    expect(actionItemsService.cancelBySource).toHaveBeenCalledWith(
      3,
      'daily-activity:missing-escalation:manager:10:2026-06-09',
    );
    expect(actionItemsService.cancelBySource).toHaveBeenCalledWith(
      3,
      'daily-activity:missing-escalation:department-head:10:2026-06-08',
    );
  });

  it('converts local cutoff times to the configured timezone correctly', () => {
    const toUtc = (
      service as unknown as {
        localDateTimeToUtc: (date: string, time: string, zone: string) => Date;
      }
    ).localDateTimeToUtc.bind(service);

    expect(
      toUtc('2026-06-10', '20:00', 'Africa/Dar_es_Salaam').toISOString(),
    ).toBe('2026-06-10T17:00:00.000Z');
    expect(toUtc('2026-03-08', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-03-08T13:00:00.000Z',
    );
  });
});
