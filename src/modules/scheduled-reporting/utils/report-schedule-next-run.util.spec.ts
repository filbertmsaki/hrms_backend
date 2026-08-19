import { ReportScheduleTypeEnum } from '../enums/report-schedule-type.enum';
import { ReportWeekdayEnum } from '../enums/report-weekday.enum';
import { computeNextScheduleRunAt } from './report-schedule-next-run.util';

describe('computeNextScheduleRunAt', () => {
  it('schedules DAILY for later today when the execution time has not passed (UTC)', () => {
    const from = new Date('2026-08-18T05:00:00.000Z');
    const next = computeNextScheduleRunAt(
      {
        scheduleType: ReportScheduleTypeEnum.DAILY,
        executionTime: '09:00:00',
        timezone: 'UTC',
      },
      from,
    );

    expect(next?.toISOString()).toBe('2026-08-18T09:00:00.000Z');
  });

  it('rolls DAILY to tomorrow when the execution time has already passed today (UTC)', () => {
    const from = new Date('2026-08-18T10:00:00.000Z');
    const next = computeNextScheduleRunAt(
      {
        scheduleType: ReportScheduleTypeEnum.DAILY,
        executionTime: '09:00:00',
        timezone: 'UTC',
      },
      from,
    );

    expect(next?.toISOString()).toBe('2026-08-19T09:00:00.000Z');
  });

  it('honors WEEKLY weekday selection', () => {
    // 2026-08-18 is a Tuesday.
    const from = new Date('2026-08-18T05:00:00.000Z');
    const next = computeNextScheduleRunAt(
      {
        scheduleType: ReportScheduleTypeEnum.WEEKLY,
        executionTime: '09:00:00',
        timezone: 'UTC',
        weekdays: [ReportWeekdayEnum.FRIDAY],
      },
      from,
    );

    // Next Friday from Tuesday 2026-08-18 is 2026-08-21.
    expect(next?.toISOString()).toBe('2026-08-21T09:00:00.000Z');
  });

  it('honors MONTHLY dayOfMonth', () => {
    const from = new Date('2026-08-05T05:00:00.000Z');
    const next = computeNextScheduleRunAt(
      {
        scheduleType: ReportScheduleTypeEnum.MONTHLY,
        executionTime: '09:00:00',
        timezone: 'UTC',
        dayOfMonth: 20,
      },
      from,
    );

    expect(next?.toISOString()).toBe('2026-08-20T09:00:00.000Z');
  });

  it('rolls MONTHLY to next month when the day has already passed', () => {
    const from = new Date('2026-08-25T05:00:00.000Z');
    const next = computeNextScheduleRunAt(
      {
        scheduleType: ReportScheduleTypeEnum.MONTHLY,
        executionTime: '09:00:00',
        timezone: 'UTC',
        dayOfMonth: 20,
      },
      from,
    );

    expect(next?.toISOString()).toBe('2026-09-20T09:00:00.000Z');
  });

  it('computes the correct UTC instant for a non-UTC timezone (Africa/Dar_es_Salaam, UTC+3)', () => {
    const from = new Date('2026-08-18T00:00:00.000Z'); // 03:00 local
    const next = computeNextScheduleRunAt(
      {
        scheduleType: ReportScheduleTypeEnum.DAILY,
        executionTime: '09:00:00',
        timezone: 'Africa/Dar_es_Salaam',
      },
      from,
    );

    // 09:00 local (UTC+3) == 06:00 UTC.
    expect(next?.toISOString()).toBe('2026-08-18T06:00:00.000Z');
  });

  it('returns null for ONE_TIME and MANUAL schedule types', () => {
    const from = new Date('2026-08-18T00:00:00.000Z');
    expect(
      computeNextScheduleRunAt(
        { scheduleType: ReportScheduleTypeEnum.ONE_TIME },
        from,
      ),
    ).toBeNull();
    expect(
      computeNextScheduleRunAt(
        { scheduleType: ReportScheduleTypeEnum.MANUAL },
        from,
      ),
    ).toBeNull();
  });
});
