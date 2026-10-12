import { BadRequestException } from '@nestjs/common';
import { LeaveDurationTypeEnum } from '../enums/leave-duration-type.enum';
import { LeaveDayTreatmentEnum } from '../enums/leave-day-treatment.enum';
import { LeaveDurationCalculatorService } from './leave-duration-calculator.service';

describe('LeaveDurationCalculatorService', () => {
  const holidayRepository = { find: jest.fn() };
  const scheduleResolver = { resolveForDate: jest.fn() };
  const configService = { get: jest.fn().mockReturnValue(480) };
  const service = new LeaveDurationCalculatorService(
    holidayRepository as never,
    scheduleResolver as never,
    configService as never,
  );
  const employee = { id: 12, hire_date: '2020-01-01' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    holidayRepository.find.mockResolvedValue([]);
    scheduleResolver.resolveForDate.mockResolvedValue({
      isHoliday: false,
      isOffDay: false,
    });
    configService.get.mockReturnValue(480);
  });

  it('calculates a full-day range using the employee schedule and records included dates', async () => {
    const result = await service.calculate({
      companyId: 1,
      employee,
      policy: null,
      durationType: LeaveDurationTypeEnum.FULL_DAY,
      startDate: '2026-10-12',
      endDate: '2026-10-14',
    });

    expect(result.totalDays).toBe(3);
    expect(result.snapshot.included_dates).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
    expect(result.hash).toHaveLength(64);
  });

  it('excludes schedule off-days and holidays under the applicable policy', async () => {
    scheduleResolver.resolveForDate.mockImplementation(
      async (_companyId: number, _employeeId: number, date: string) => ({
        isHoliday: date === '2026-10-13',
        isOffDay: date === '2026-10-14',
      }),
    );
    const result = await service.calculate({
      companyId: 1,
      employee,
      policy: {
        holiday_treatment: LeaveDayTreatmentEnum.EXCLUDE,
        weekly_off_treatment: LeaveDayTreatmentEnum.EMPLOYEE_SCHEDULE,
      } as never,
      durationType: LeaveDurationTypeEnum.FULL_DAY,
      startDate: '2026-10-12',
      endDate: '2026-10-14',
    });

    expect(result.totalDays).toBe(1);
    expect(result.snapshot.excluded_dates).toEqual([
      { date: '2026-10-13', reason: 'holiday' },
      { date: '2026-10-14', reason: 'weekly_off' },
    ]);
  });

  it('calculates half days and rejects them when the policy disallows them', async () => {
    const input = {
      companyId: 1,
      employee,
      policy: { allow_half_day: true } as never,
      durationType: LeaveDurationTypeEnum.HALF_DAY,
      startDate: '2026-10-12',
      endDate: '2026-10-12',
    };
    await expect(service.calculate(input)).resolves.toMatchObject({
      totalDays: 0.5,
      requestedMinutes: 240,
    });
    await expect(
      service.calculate({
        ...input,
        policy: { allow_half_day: false } as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calculates short leave in minutes and enforces policy limits', async () => {
    const input = {
      companyId: 1,
      employee,
      policy: {
        allow_short_leave: true,
        minimum_short_leave_minutes: 60,
        maximum_short_leave_minutes: 300,
      } as never,
      durationType: LeaveDurationTypeEnum.SHORT_LEAVE,
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      startTime: '09:00',
      endTime: '13:00',
    };
    await expect(service.calculate(input)).resolves.toMatchObject({
      totalDays: 0.5,
      requestedMinutes: 240,
    });
    await expect(
      service.calculate({ ...input, endTime: '09:30' }),
    ).rejects.toThrow('Short leave must be at least 60 minute(s).');
    await expect(
      service.calculate({ ...input, endTime: '15:00' }),
    ).rejects.toThrow('Short leave cannot exceed 300 minute(s).');
  });

  it('rejects reversed ranges and invalid duration boundaries', async () => {
    await expect(
      service.calculate({
        companyId: 1,
        employee,
        policy: null,
        durationType: LeaveDurationTypeEnum.FULL_DAY,
        startDate: '2026-10-14',
        endDate: '2026-10-12',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.calculate({
        companyId: 1,
        employee,
        policy: { allow_half_day: true } as never,
        durationType: LeaveDurationTypeEnum.HALF_DAY,
        startDate: '2026-10-12',
        endDate: '2026-10-13',
      }),
    ).rejects.toThrow('Half-day leave must start and end on the same date.');
  });
});
