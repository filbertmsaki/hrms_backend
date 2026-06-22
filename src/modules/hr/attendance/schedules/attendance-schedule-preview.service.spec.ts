import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AttendanceScheduleResolverService } from '../processing/attendance-schedule-resolver.service';
import { AttendanceSchedulePreviewService } from './attendance-schedule-preview.service';

describe('AttendanceSchedulePreviewService', () => {
  let service: AttendanceSchedulePreviewService;
  let scheduleResolver: {
    resolveForDate: jest.Mock;
  };
  let shiftRepository: {
    find: jest.Mock;
  };
  let timetableRepository: {
    find: jest.Mock;
  };

  beforeEach(() => {
    scheduleResolver = {
      resolveForDate: jest.fn(),
    };
    shiftRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    timetableRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    service = new AttendanceSchedulePreviewService(
      scheduleResolver as unknown as AttendanceScheduleResolverService,
      shiftRepository as unknown as Repository<any>,
      timetableRepository as unknown as Repository<any>,
    );
  });

  it('returns local schedule times instead of UTC-shifted time fragments', async () => {
    scheduleResolver.resolveForDate.mockResolvedValue({
      employeeId: 39,
      scheduleDate: '2026-06-22',
      source: 'SHIFT_SCHEDULE',
      timezone: 'Africa/Dar_es_Salaam',
      shiftId: null,
      timetableId: null,
      branchId: 3,
      isOffDay: false,
      isHoliday: false,
      holidayId: null,
      scheduleStartAt: new Date('2026-06-22T08:00:00+03:00'),
      scheduleEndAt: new Date('2026-06-22T17:00:00+03:00'),
      lateAfterMinutes: 0,
      halfDayAfterMinutes: 0,
      absentAfterMinutes: 0,
      graceInMinutes: 0,
      graceOutMinutes: 0,
      earlyLeaveAfterMinutes: 0,
      allowEarlyCheckin: true,
      allowLateCheckout: true,
      autoAbsentIfNoCheckin: false,
      allowOvertime: false,
      overtimeStartAfterMinutes: 0,
      maxOvertimeMinutes: 0,
      requiresCheckout: true,
      ignoreMissingCheckoutIfHoursValid: false,
    });

    const result = await service.preview(7, {
      employee_id: 39,
      from_date: '2026-06-22',
      to_date: '2026-06-22',
      timezone: 'Africa/Dar_es_Salaam',
    });

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        start_time: '08:00:00',
        end_time: '17:00:00',
      }),
    );
  });

  it('rejects preview ranges that exceed the requested maximum', async () => {
    await expect(
      service.preview(7, {
        employee_id: 39,
        from_date: '2026-06-01',
        to_date: '2026-06-05',
        max_days: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
