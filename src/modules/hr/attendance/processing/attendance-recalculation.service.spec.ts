jest.mock('../../../hikvision/hikvision-attendance-sync.service', () => ({
  HikvisionAttendanceSyncService: class HikvisionAttendanceSyncService {},
}));

import { Repository } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import { AttendanceRecalculationJob } from './entities/attendance-recalculation-job.entity';
import { AttendanceProcessingJobStatusEnum } from './enums/attendance-processing-job-status.enum';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import {
  AttendanceRefreshExecutionModeEnum,
  AttendanceRefreshExecutionEnum,
  AttendanceRefreshProcessingSourceEnum,
  AttendanceRefreshModeEnum,
} from './dtos/refresh-attendance-daily-summaries.dto';

const createClaimBuilderMock = (affected: number) => ({
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({ affected }),
});

describe('AttendanceRecalculationService', () => {
  let service: AttendanceRecalculationService;
  let claimBuilder: ReturnType<typeof createClaimBuilderMock>;
  let jobRepository: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let attendanceProcessingService: { processRange: jest.Mock };
  let attendanceDailySummaryService: {
    rebuildSummariesForRange: jest.Mock;
  };
  let attendanceDeviceRepository: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let employeeDeviceAssignmentRepository: { find: jest.Mock };
  let moduleRef: { get: jest.Mock };
  let hikvisionAttendanceSyncService: {
    syncAttendanceByDateRangeForDeviceTimezone: jest.Mock;
  };

  beforeEach(() => {
    claimBuilder = createClaimBuilderMock(1);
    jobRepository = {
      createQueryBuilder: jest.fn(() => claimBuilder),
      create: jest.fn((job: AttendanceRecalculationJob) => job),
      findOne: jest.fn(),
      save: jest.fn((job: AttendanceRecalculationJob) => job),
      find: jest.fn(),
    };
    attendanceProcessingService = {
      processRange: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    };
    attendanceDailySummaryService = {
      rebuildSummariesForRange: jest
        .fn()
        .mockResolvedValue({ summariesUpserted: 31 }),
    };
    attendanceDeviceRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    employeeDeviceAssignmentRepository = {
      find: jest.fn(),
    };
    hikvisionAttendanceSyncService = {
      syncAttendanceByDateRangeForDeviceTimezone: jest.fn(),
    };
    moduleRef = {
      get: jest.fn(() => hikvisionAttendanceSyncService),
    };

    service = new AttendanceRecalculationService(
      jobRepository as unknown as Repository<AttendanceRecalculationJob>,
      attendanceDeviceRepository as unknown as Repository<AttendanceDevice>,
      employeeDeviceAssignmentRepository as unknown as Repository<EmployeeDeviceAssignment>,
      moduleRef as unknown as ModuleRef,
      attendanceProcessingService as unknown as AttendanceProcessingService,
      attendanceDailySummaryService as unknown as AttendanceDailySummaryService,
    );
  });

  it('claims a pending job before processing it', async () => {
    const job = {
      id: 41,
      companyId: 3,
      employeeId: 7,
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      status: AttendanceProcessingJobStatusEnum.PROCESSING,
      metadata: {
        refresh_mode: AttendanceRefreshModeEnum.FROM_RAW_LOGS,
      },
    };
    jobRepository.findOne.mockResolvedValue(job);

    const result = await service.executeJob(41);

    expect(attendanceProcessingService.processRange).toHaveBeenCalledWith(3, {
      start_date: '2026-07-01',
      end_date: '2026-07-31',
      employee_id: 7,
      device_id: undefined,
      rebuild_summaries: true,
      force_rebuild_summaries: true,
    });
    expect(jobRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 41,
        status: AttendanceProcessingJobStatusEnum.SUCCESS,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        jobId: 41,
        status: AttendanceProcessingJobStatusEnum.SUCCESS,
      }),
    );
  });

  it('rejects duplicate execution when the job is already processing elsewhere', async () => {
    claimBuilder = createClaimBuilderMock(0);
    jobRepository.createQueryBuilder.mockReturnValue(claimBuilder);
    jobRepository.findOne.mockResolvedValue({
      id: 41,
      status: AttendanceProcessingJobStatusEnum.PROCESSING,
    });

    await expect(service.executeJob(41)).rejects.toThrow(
      'Recalculation job is already processing',
    );
    expect(attendanceProcessingService.processRange).not.toHaveBeenCalled();
  });

  it('returns the refreshed job state after async refresh is queued', async () => {
    const savedJob = {
      id: 41,
      companyId: 3,
      employeeId: null,
      dateFrom: '2026-07-23',
      dateTo: '2026-07-24',
      status: AttendanceProcessingJobStatusEnum.PENDING,
      attempts: 0,
      requestedByCompanyUserId: 9,
      metadata: {
        refresh_mode: AttendanceRefreshModeEnum.FROM_RAW_LOGS,
      },
    } as AttendanceRecalculationJob;

    jobRepository.save.mockResolvedValue(savedJob);
    jobRepository.findOne.mockResolvedValue(savedJob);
    const executeJobSpy = jest.spyOn(service, 'executeJob').mockResolvedValue({
      jobId: 41,
      status: AttendanceProcessingJobStatusEnum.SUCCESS,
      result: { status: 'SUCCESS' },
    });

    const result = await service.refreshSummaries(3, 9, {
      start_date: '2026-07-23',
      end_date: '2026-07-24',
      mode: AttendanceRefreshModeEnum.FROM_RAW_LOGS,
      execution: AttendanceRefreshExecutionEnum.ASYNC,
    });

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(result.job.id).toBe(41);
    expect(result.job.status).toBe(AttendanceProcessingJobStatusEnum.PENDING);
    expect(result.executionResult).toBeNull();
    expect(executeJobSpy).toHaveBeenCalledWith(41);
  });

  it('runs summaries-only refresh synchronously without creating a job', async () => {
    const result = await service.refreshSummaries(3, 9, {
      start_date: '2026-07-01',
      end_date: '2026-07-31',
      mode: AttendanceRefreshModeEnum.SUMMARIES_ONLY,
      execution: AttendanceRefreshExecutionEnum.SYNC,
    });

    expect(
      attendanceDailySummaryService.rebuildSummariesForRange,
    ).toHaveBeenCalledWith({
      companyId: 3,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      employeeId: undefined,
      deviceId: undefined,
      forceRebuild: true,
    });
    expect(result).toEqual({
      job: null,
      executionResult: { summariesUpserted: 31 },
    });
    expect(attendanceProcessingService.processRange).not.toHaveBeenCalled();
  });

  it('fetches from Hikvision first and then processes stored data through the existing range processor', async () => {
    const deviceQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 12,
          companyId: 3,
          deviceCode: 'HQ-ENTRY',
          status: 'ACTIVE',
          syncMode: 'PULL',
          integrationType: 'hikvision',
          vendorName: 'Hikvision',
        },
      ]),
    };
    attendanceDeviceRepository.createQueryBuilder.mockReturnValue(
      deviceQueryBuilder,
    );
    hikvisionAttendanceSyncService.syncAttendanceByDateRangeForDeviceTimezone.mockResolvedValue(
      {
        status: 'SUCCESS',
        recordsReceived: 18,
        recordsCreated: 10,
        recordsUpdated: 4,
        duplicatesSkipped: 4,
        unmappedEmployees: 0,
        recordsFailed: 0,
        validPunchRecords: 18,
      },
    );
    attendanceProcessingService.processRange.mockResolvedValue({
      status: 'SUCCESS',
      summary: { summariesUpserted: 5 },
    });

    const result = await service.refreshSummaries(3, 9, {
      start_date: '2026-07-01',
      end_date: '2026-07-31',
      processing_source:
        AttendanceRefreshProcessingSourceEnum.FETCH_AND_PROCESS,
      execution_mode: AttendanceRefreshExecutionModeEnum.IMMEDIATE,
    });

    expect(
      hikvisionAttendanceSyncService.syncAttendanceByDateRangeForDeviceTimezone,
    ).toHaveBeenCalledWith(
      3,
      12,
      '2026-07-01',
      '2026-07-31',
      undefined,
      undefined,
      9,
      {
        queueAttendanceRecalculation: false,
      },
    );
    expect(attendanceProcessingService.processRange).toHaveBeenCalledWith(3, {
      start_date: '2026-07-01',
      end_date: '2026-07-31',
      employee_id: undefined,
      device_id: undefined,
      rebuild_summaries: true,
      force_rebuild_summaries: true,
    });
    expect(result.job).toBeNull();
    expect(result.executionResult).toEqual(
      expect.objectContaining({
        processingSource:
          AttendanceRefreshProcessingSourceEnum.FETCH_AND_PROCESS,
        status: 'SUCCESS',
      }),
    );
    expect(result.executionResult).toMatchObject({
      fetch: {
        devices_succeeded: 1,
        records_created: 10,
      },
      process: {
        status: 'SUCCESS',
      },
    });
  });
});
