import { Repository } from 'typeorm';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import { AttendanceRecalculationJob } from './entities/attendance-recalculation-job.entity';
import { AttendanceProcessingJobStatusEnum } from './enums/attendance-processing-job-status.enum';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import {
  AttendanceRefreshExecutionEnum,
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

    service = new AttendanceRecalculationService(
      jobRepository as unknown as Repository<AttendanceRecalculationJob>,
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
      forceRebuild: true,
    });
    expect(result).toEqual({
      job: null,
      executionResult: { summariesUpserted: 31 },
    });
    expect(attendanceProcessingService.processRange).not.toHaveBeenCalled();
  });
});
