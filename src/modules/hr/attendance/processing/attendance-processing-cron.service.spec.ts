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
import { AttendanceCleanupSettingsService } from './attendance-cleanup-settings.service';
import { AttendanceAuxiliaryCleanupService } from './attendance-auxiliary-cleanup.service';
import { AttendanceCleanupMonitorService } from './attendance-cleanup-monitor.service';

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
  let dailySummaryService: {
    rebuildSummariesForEmployeeDates: jest.Mock;
    refreshExpiredArrivalGrace: jest.Mock;
    deletePreviousDayUnmatchedLogs: jest.Mock;
  };
  let eventIngestionService: { processPendingMobilePunches: jest.Mock };
  let recalculationService: {
    processPendingJobs: jest.Mock;
    deletePreviousDaySuccessfulJobs: jest.Mock;
  };
  let advisoryLockService: { runWithLock: jest.Mock };
  let cleanupSettings: { enabledCompanies: jest.Mock; get: jest.Mock };
  let cleanupMonitor: {
    record: jest.Mock;
    needsRecovery: jest.Mock;
    assertReady: jest.Mock;
  };
  let auxiliaryCleanup: {
    deleteExpiredSignInRequests: jest.Mock;
    deleteCompletedNotificationQueueEntries: jest.Mock;
    deleteCompletedImportQueueEntries: jest.Mock;
  };
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
      refreshExpiredArrivalGrace: jest.fn().mockResolvedValue(undefined),
      deletePreviousDayUnmatchedLogs: jest.fn().mockResolvedValue(2),
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
      deletePreviousDaySuccessfulJobs: jest.fn().mockResolvedValue(3),
    };
    advisoryLockService = {
      runWithLock: jest.fn(
        async (_key: string, callback: () => Promise<unknown>) => ({
          acquired: true,
          result: await callback(),
        }),
      ),
    };
    cleanupSettings = {
      enabledCompanies: jest.fn().mockResolvedValue([3]),
      get: jest
        .fn()
        .mockResolvedValue({ recalculationJobs: true, unmatchedLogs: true }),
    };
    auxiliaryCleanup = {
      deleteExpiredSignInRequests: jest.fn().mockResolvedValue(1),
      deleteCompletedNotificationQueueEntries: jest.fn().mockResolvedValue(1),
      deleteCompletedImportQueueEntries: jest.fn().mockResolvedValue(1),
    };
    cleanupMonitor = {
      record: jest.fn().mockResolvedValue(undefined),
      needsRecovery: jest.fn().mockResolvedValue(true),
      assertReady: jest.fn().mockResolvedValue(undefined),
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
      cleanupSettings as unknown as AttendanceCleanupSettingsService,
      auxiliaryCleanup as unknown as AttendanceAuxiliaryCleanupService,
      cleanupMonitor as unknown as AttendanceCleanupMonitorService,
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

  it('runs unmatched log cleanup for the configured company under a lock', async () => {
    await service.cleanUpUnmatchedLogs();
    expect(advisoryLockService.runWithLock).toHaveBeenCalledWith(
      'attendance:cleanup:unmatchedLogs',
      expect.any(Function),
    );
    expect(
      dailySummaryService.deletePreviousDayUnmatchedLogs,
    ).toHaveBeenCalledWith(3);
  });

  it('runs only the enabled auxiliary cleanup for each company', async () => {
    cleanupSettings.get.mockResolvedValue({
      expiredSignInRequests: true,
      notificationQueue: false,
      importQueue: false,
    });
    await service.cleanUpAuxiliaryRecords();
    expect(auxiliaryCleanup.deleteExpiredSignInRequests).toHaveBeenCalledWith(
      3,
    );
    expect(
      auxiliaryCleanup.deleteCompletedNotificationQueueEntries,
    ).not.toHaveBeenCalled();
    expect(
      auxiliaryCleanup.deleteCompletedImportQueueEntries,
    ).not.toHaveBeenCalled();
  });

  it('cleans only companies whose settings still enable the cleanup', async () => {
    cleanupSettings.enabledCompanies.mockResolvedValue([3, 4]);
    cleanupSettings.get.mockImplementation(async (companyId: number) => ({
      recalculationJobs: companyId === 3,
      unmatchedLogs: false,
    }));
    await service.cleanUpRecalculationJobs();
    expect(
      recalculationService.deletePreviousDaySuccessfulJobs,
    ).toHaveBeenCalledTimes(1);
    expect(
      recalculationService.deletePreviousDaySuccessfulJobs,
    ).toHaveBeenCalledWith(3);
  });

  it('skips unmatched log cleanup without a configured company', async () => {
    cleanupSettings.enabledCompanies.mockResolvedValue([]);
    await service.cleanUpUnmatchedLogs();
    expect(
      dailySummaryService.deletePreviousDayUnmatchedLogs,
    ).not.toHaveBeenCalled();
  });

  it('runs recalculation cleanup under an advisory lock', async () => {
    await service.cleanUpRecalculationJobs();
    expect(advisoryLockService.runWithLock).toHaveBeenCalledWith(
      'attendance:cleanup:recalculationJobs',
      expect.any(Function),
    );
    expect(
      recalculationService.deletePreviousDaySuccessfulJobs,
    ).toHaveBeenCalledWith(3);
  });

  it('recovers a missed run and records its scheduled date', async () => {
    cleanupSettings.get.mockResolvedValue({ recalculationJobs: true });
    await service.recoverMissedCleanups();
    expect(cleanupMonitor.needsRecovery).toHaveBeenCalledWith(
      3,
      'recalculationJobs',
      '2026-06-21',
    );
    expect(cleanupMonitor.record).toHaveBeenCalledWith(
      3,
      'recalculationJobs',
      '2026-06-21',
      3,
    );
    expect(
      recalculationService.deletePreviousDaySuccessfulJobs,
    ).toHaveBeenCalledWith(3, '2026-06-21');
    expect(
      recalculationService.deletePreviousDaySuccessfulJobs,
    ).toHaveBeenCalledTimes(1);
  });

  it('does not rerun a cleanup already recovered', async () => {
    cleanupSettings.get.mockResolvedValue({ recalculationJobs: true });
    cleanupMonitor.needsRecovery.mockResolvedValue(false);
    await service.recoverMissedCleanups();
    expect(
      recalculationService.deletePreviousDaySuccessfulJobs,
    ).not.toHaveBeenCalled();
  });

  it('skips cleanup when no company is configured', async () => {
    cleanupSettings.enabledCompanies.mockResolvedValue([]);
    await service.cleanUpRecalculationJobs();
    expect(
      recalculationService.deletePreviousDaySuccessfulJobs,
    ).not.toHaveBeenCalled();
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

    expect(dailySummaryService.refreshExpiredArrivalGrace).toHaveBeenCalledWith(
      [1, 2],
    );

    expect(processingService.processIncrementalDate).toHaveBeenCalledTimes(1);
    expect(processingService.processIncrementalDate).toHaveBeenCalledWith(
      1,
      '2026-06-22',
    );
    expect(
      eventIngestionService.processPendingMobilePunches,
    ).toHaveBeenCalledWith(200);
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

  it('does not schedule policy-based reconciliation when the active policy disables it', async () => {
    pendingRawLogBuilder.getRawMany.mockResolvedValue([]);
    reconciliationRawLogBuilder.getRawMany.mockResolvedValue([]);
    timetableAssignmentBuilder.getRawMany.mockResolvedValue([
      { companyId: '2' },
    ]);
    shiftAssignmentBuilder.getRawMany.mockResolvedValue([]);
    shiftScheduleBuilder.getRawMany.mockResolvedValue([]);
    defaultTimetableBuilder.getRawMany.mockResolvedValue([]);
    attendancePolicyRepository.find.mockResolvedValue([
      {
        id: 12,
        company_id: 2,
        calculation_time: '09:00',
        auto_calculate_attendance: false,
        is_active: true,
      },
    ]);
    await service.runIncrementalProcessing();
    expect(processingService.processRange).not.toHaveBeenCalled();
    expect(dailySummaryService.refreshExpiredArrivalGrace).toHaveBeenCalledWith(
      [],
    );
  });

  it('skips incremental execution when the distributed lock is held elsewhere', async () => {
    advisoryLockService.runWithLock.mockResolvedValue({
      acquired: false,
    });

    await service.runIncrementalProcessing();

    expect(processingService.processIncrementalDate).not.toHaveBeenCalled();
    expect(
      eventIngestionService.processPendingMobilePunches,
    ).not.toHaveBeenCalled();
  });
});
