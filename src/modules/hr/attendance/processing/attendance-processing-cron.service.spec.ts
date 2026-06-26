import { Repository } from 'typeorm';
import { AttendanceProcessingCronService } from './attendance-processing-cron.service';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceRecalculationService } from './attendance-recalculation.service';

const createQueryBuilderMock = () => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getRawMany: jest.fn(),
});

describe('AttendanceProcessingCronService', () => {
  let service: AttendanceProcessingCronService;
  let rawLogBuilder: ReturnType<typeof createQueryBuilderMock>;
  let timetableAssignmentBuilder: ReturnType<typeof createQueryBuilderMock>;
  let shiftAssignmentBuilder: ReturnType<typeof createQueryBuilderMock>;
  let shiftScheduleBuilder: ReturnType<typeof createQueryBuilderMock>;
  let defaultTimetableBuilder: ReturnType<typeof createQueryBuilderMock>;
  let rawLogRepository: { createQueryBuilder: jest.Mock };
  let employeeTimetableRepository: { createQueryBuilder: jest.Mock };
  let shiftAssignmentRepository: { createQueryBuilder: jest.Mock };
  let shiftScheduleRepository: { createQueryBuilder: jest.Mock };
  let timetableRepository: { createQueryBuilder: jest.Mock };
  let attendancePolicyRepository: { find: jest.Mock };
  let processingService: { processRange: jest.Mock };
  let recalculationService: { processPendingJobs: jest.Mock };
  const originalEnv = {
    ATTENDANCE_PROCESSING_ENABLED: process.env.ATTENDANCE_PROCESSING_ENABLED,
    ATTENDANCE_CALCULATION_WINDOW_MINUTES:
      process.env.ATTENDANCE_CALCULATION_WINDOW_MINUTES,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 22, 9, 5, 0));

    process.env.ATTENDANCE_PROCESSING_ENABLED = 'true';
    process.env.ATTENDANCE_CALCULATION_WINDOW_MINUTES = '10';

    rawLogBuilder = createQueryBuilderMock();
    timetableAssignmentBuilder = createQueryBuilderMock();
    shiftAssignmentBuilder = createQueryBuilderMock();
    shiftScheduleBuilder = createQueryBuilderMock();
    defaultTimetableBuilder = createQueryBuilderMock();

    rawLogRepository = {
      createQueryBuilder: jest.fn(() => rawLogBuilder),
    };
    employeeTimetableRepository = {
      createQueryBuilder: jest.fn(() => timetableAssignmentBuilder),
    };
    shiftAssignmentRepository = {
      createQueryBuilder: jest.fn(() => shiftAssignmentBuilder),
    };
    shiftScheduleRepository = {
      createQueryBuilder: jest.fn(() => shiftScheduleBuilder),
    };
    timetableRepository = {
      createQueryBuilder: jest.fn(() => defaultTimetableBuilder),
    };
    attendancePolicyRepository = {
      find: jest.fn(),
    };
    processingService = {
      processRange: jest.fn().mockResolvedValue(undefined),
    };
    recalculationService = {
      processPendingJobs: jest.fn().mockResolvedValue(undefined),
    };

    service = new AttendanceProcessingCronService(
      rawLogRepository as unknown as Repository<HikvisionAttendanceLog>,
      employeeTimetableRepository as unknown as Repository<EmployeeTimetable>,
      shiftAssignmentRepository as unknown as Repository<ShiftAssignment>,
      shiftScheduleRepository as unknown as Repository<ShiftSchedule>,
      timetableRepository as unknown as Repository<Timetable>,
      attendancePolicyRepository as unknown as Repository<AttendancePolicy>,
      processingService as unknown as AttendanceProcessingService,
      recalculationService as unknown as AttendanceRecalculationService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();

    if (originalEnv.ATTENDANCE_PROCESSING_ENABLED === undefined) {
      delete process.env.ATTENDANCE_PROCESSING_ENABLED;
    } else {
      process.env.ATTENDANCE_PROCESSING_ENABLED =
        originalEnv.ATTENDANCE_PROCESSING_ENABLED;
    }

    if (originalEnv.ATTENDANCE_CALCULATION_WINDOW_MINUTES === undefined) {
      delete process.env.ATTENDANCE_CALCULATION_WINDOW_MINUTES;
    } else {
      process.env.ATTENDANCE_CALCULATION_WINDOW_MINUTES =
        originalEnv.ATTENDANCE_CALCULATION_WINDOW_MINUTES;
    }
  });

  it('processes only companies whose active policy calculation time is due', async () => {
    rawLogBuilder.getRawMany.mockResolvedValue([{ companyId: '1' }]);
    timetableAssignmentBuilder.getRawMany.mockResolvedValue([
      { companyId: '2' },
    ]);
    shiftAssignmentBuilder.getRawMany.mockResolvedValue([{ companyId: '3' }]);
    shiftScheduleBuilder.getRawMany.mockResolvedValue([{ companyId: '1' }]);
    defaultTimetableBuilder.getRawMany.mockResolvedValue([{ companyId: '4' }]);
    attendancePolicyRepository.find.mockResolvedValue([
      {
        id: 11,
        company_id: 1,
        calculation_time: '09:00',
        auto_calculate_attendance: true,
        is_active: true,
      },
      {
        id: 12,
        company_id: 2,
        calculation_time: '09:30',
        auto_calculate_attendance: true,
        is_active: true,
      },
      {
        id: 13,
        company_id: 3,
        calculation_time: null,
        auto_calculate_attendance: true,
        is_active: true,
      },
      {
        id: 14,
        company_id: 5,
        calculation_time: '09:00',
        auto_calculate_attendance: true,
        is_active: true,
      },
    ]);

    await service.runIncrementalProcessing();

    expect(processingService.processRange).toHaveBeenCalledTimes(3);
    expect(processingService.processRange).toHaveBeenNthCalledWith(1, 1, {
      start_date: '2026-06-22',
      end_date: '2026-06-22',
      rebuild_summaries: true,
    });
    expect(processingService.processRange).toHaveBeenNthCalledWith(2, 3, {
      start_date: '2026-06-22',
      end_date: '2026-06-22',
      rebuild_summaries: true,
    });
    expect(processingService.processRange).toHaveBeenNthCalledWith(3, 4, {
      start_date: '2026-06-22',
      end_date: '2026-06-22',
      rebuild_summaries: true,
    });
  });

  it('falls back to processing companies that have attendance data but no active policy', async () => {
    rawLogBuilder.getRawMany.mockResolvedValue([{ companyId: '1' }]);
    timetableAssignmentBuilder.getRawMany.mockResolvedValue([
      { companyId: '2' },
    ]);
    shiftAssignmentBuilder.getRawMany.mockResolvedValue([]);
    shiftScheduleBuilder.getRawMany.mockResolvedValue([]);
    defaultTimetableBuilder.getRawMany.mockResolvedValue([]);
    attendancePolicyRepository.find.mockResolvedValue([]);

    await service.runIncrementalProcessing();

    expect(processingService.processRange).toHaveBeenCalledTimes(2);
    expect(processingService.processRange).toHaveBeenNthCalledWith(1, 1, {
      start_date: '2026-06-22',
      end_date: '2026-06-22',
      rebuild_summaries: true,
    });
    expect(processingService.processRange).toHaveBeenNthCalledWith(2, 2, {
      start_date: '2026-06-22',
      end_date: '2026-06-22',
      rebuild_summaries: true,
    });
  });
});
