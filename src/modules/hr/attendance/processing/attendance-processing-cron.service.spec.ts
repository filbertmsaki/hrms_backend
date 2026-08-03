jest.mock('./attendance-recalculation.service', () => ({
  AttendanceRecalculationService: class AttendanceRecalculationService {},
}));

import { Repository } from 'typeorm';
import { AttendanceProcessingCronService } from './attendance-processing-cron.service';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceMobilePunch } from '../mobile-punches/entities/attendance-mobile-punch.entity';
import { EmployeeTimetable } from '../timetable/employee-timetables/entities/employee-timetable.entity';
import { ShiftAssignment } from '../shift/shift-assignments/entities/shift-assignment.entity';
import { ShiftSchedule } from '../shift/shift-schedules/entities/shift-schedule.entity';
import { Timetable } from '../timetable/timetables/entities/timetable.entity';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { AttendanceEventIngestionService } from './attendance-event-ingestion.service';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';

const createQueryBuilderMock = () => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getRawMany: jest.fn(),
});

describe('AttendanceProcessingCronService', () => {
  let service: AttendanceProcessingCronService;
  let pendingRawLogBuilder: ReturnType<typeof createQueryBuilderMock>;
  let reconciliationRawLogBuilder: ReturnType<typeof createQueryBuilderMock>;
  let timetableAssignmentBuilder: ReturnType<typeof createQueryBuilderMock>;
  let shiftAssignmentBuilder: ReturnType<typeof createQueryBuilderMock>;
  let shiftScheduleBuilder: ReturnType<typeof createQueryBuilderMock>;
  let defaultTimetableBuilder: ReturnType<typeof createQueryBuilderMock>;
  let rawLogRepository: { createQueryBuilder: jest.Mock };
  let mobilePunchRepository: { find: jest.Mock; update: jest.Mock };
  let employeeTimetableRepository: { createQueryBuilder: jest.Mock };
  let shiftAssignmentRepository: { createQueryBuilder: jest.Mock };
  let shiftScheduleRepository: { createQueryBuilder: jest.Mock };
  let timetableRepository: { createQueryBuilder: jest.Mock };
  let attendancePolicyRepository: { find: jest.Mock };
  let processingService: {
    processIncrementalDate: jest.Mock;
    processRange: jest.Mock;
  };
  let dailySummaryService: { rebuildSummariesForEmployeeDates: jest.Mock };
  let eventIngestionService: { processPendingMobilePunches: jest.Mock };
  let recalculationService: { processPendingJobs: jest.Mock };
  let advisoryLockService: { runWithLock: jest.Mock };
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

    pendingRawLogBuilder = createQueryBuilderMock();
    reconciliationRawLogBuilder = createQueryBuilderMock();
    timetableAssignmentBuilder = createQueryBuilderMock();
    shiftAssignmentBuilder = createQueryBuilderMock();
    shiftScheduleBuilder = createQueryBuilderMock();
    defaultTimetableBuilder = createQueryBuilderMock();

    rawLogRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(pendingRawLogBuilder)
        .mockReturnValueOnce(reconciliationRawLogBuilder),
    };
    mobilePunchRepository = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
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
      processIncrementalDate: jest.fn().mockResolvedValue(undefined),
      processRange: jest.fn().mockResolvedValue(undefined),
    };
    dailySummaryService = {
      rebuildSummariesForEmployeeDates: jest.fn().mockResolvedValue(undefined),
    };
    eventIngestionService = {
      processPendingMobilePunches: jest.fn().mockResolvedValue({
        selected: 0,
        processed: 0,
        failed: 0,
      }),
    };
    recalculationService = {
      processPendingJobs: jest.fn().mockResolvedValue(undefined),
    };
    advisoryLockService = {
      runWithLock: jest.fn(async (_key: string, callback: () => Promise<unknown>) => ({
        acquired: true,
        result: await callback(),
      })),
    };

    service = new AttendanceProcessingCronService(
      rawLogRepository as unknown as Repository<HikvisionAttendanceLog>,
      mobilePunchRepository as unknown as Repository<AttendanceMobilePunch>,
      employeeTimetableRepository as unknown as Repository<EmployeeTimetable>,
      shiftAssignmentRepository as unknown as Repository<ShiftAssignment>,
      shiftScheduleRepository as unknown as Repository<ShiftSchedule>,
      timetableRepository as unknown as Repository<Timetable>,
      attendancePolicyRepository as unknown as Repository<AttendancePolicy>,
      processingService as unknown as AttendanceProcessingService,
      dailySummaryService as unknown as AttendanceDailySummaryService,
      eventIngestionService as unknown as AttendanceEventIngestionService,
      recalculationService as unknown as AttendanceRecalculationService,
      advisoryLockService as unknown as PostgresAdvisoryLockService,
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

  it('processes pending raw logs incrementally, refreshes approved mobile punches, and reconciles due companies', async () => {
    pendingRawLogBuilder.getRawMany.mockResolvedValue([{ companyId: '1' }]);
    reconciliationRawLogBuilder.getRawMany.mockResolvedValue([
      { companyId: '1' },
    ]);
    timetableAssignmentBuilder.getRawMany.mockResolvedValue([
      { companyId: '2' },
    ]);
    shiftAssignmentBuilder.getRawMany.mockResolvedValue([]);
    shiftScheduleBuilder.getRawMany.mockResolvedValue([]);
    defaultTimetableBuilder.getRawMany.mockResolvedValue([]);
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
    ]);

    await service.runIncrementalProcessing();

    expect(processingService.processIncrementalDate).toHaveBeenCalledTimes(1);
    expect(processingService.processIncrementalDate).toHaveBeenCalledWith(
      1,
      '2026-06-22',
    );
    expect(eventIngestionService.processPendingMobilePunches).toHaveBeenCalledWith(
      200,
    );
    expect(processingService.processRange).toHaveBeenCalledTimes(1);
    expect(processingService.processRange).toHaveBeenCalledWith(1, {
      start_date: '2026-06-22',
      end_date: '2026-06-22',
      rebuild_summaries: true,
    });
  });

  it('falls back to scheduled reconciliation for companies without active attendance policies', async () => {
    pendingRawLogBuilder.getRawMany.mockResolvedValue([]);
    reconciliationRawLogBuilder.getRawMany.mockResolvedValue([]);
    timetableAssignmentBuilder.getRawMany.mockResolvedValue([
      { companyId: '2' },
    ]);
    shiftAssignmentBuilder.getRawMany.mockResolvedValue([]);
    shiftScheduleBuilder.getRawMany.mockResolvedValue([]);
    defaultTimetableBuilder.getRawMany.mockResolvedValue([]);
    attendancePolicyRepository.find.mockResolvedValue([]);

    await service.runIncrementalProcessing();

    expect(processingService.processIncrementalDate).not.toHaveBeenCalled();
    expect(processingService.processRange).toHaveBeenCalledTimes(1);
    expect(processingService.processRange).toHaveBeenCalledWith(2, {
      start_date: '2026-06-22',
      end_date: '2026-06-22',
      rebuild_summaries: true,
    });
  });

  it('skips incremental execution when the distributed lock is held elsewhere', async () => {
    advisoryLockService.runWithLock.mockResolvedValue({
      acquired: false,
    });

    await service.runIncrementalProcessing();

    expect(processingService.processIncrementalDate).not.toHaveBeenCalled();
    expect(eventIngestionService.processPendingMobilePunches).not.toHaveBeenCalled();
  });
});
