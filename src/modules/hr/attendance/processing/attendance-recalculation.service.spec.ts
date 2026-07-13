import { Repository } from 'typeorm';
import { AttendanceRecalculationService } from './attendance-recalculation.service';
import { AttendanceRecalculationJob } from './entities/attendance-recalculation-job.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AttendanceProcessingJobStatusEnum } from './enums/attendance-processing-job-status.enum';
import { AttendanceProcessingService } from './attendance-processing.service';

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
    findOne: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let employeeRepository: { createQueryBuilder: jest.Mock };
  let attendanceProcessingService: { processRange: jest.Mock };

  beforeEach(() => {
    claimBuilder = createClaimBuilderMock(1);
    jobRepository = {
      createQueryBuilder: jest.fn(() => claimBuilder),
      findOne: jest.fn(),
      save: jest.fn((job: AttendanceRecalculationJob) => job),
      find: jest.fn(),
    };
    employeeRepository = {
      createQueryBuilder: jest.fn(),
    };
    attendanceProcessingService = {
      processRange: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    };

    service = new AttendanceRecalculationService(
      jobRepository as unknown as Repository<AttendanceRecalculationJob>,
      employeeRepository as unknown as Repository<Employee>,
      attendanceProcessingService as unknown as AttendanceProcessingService,
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
});
