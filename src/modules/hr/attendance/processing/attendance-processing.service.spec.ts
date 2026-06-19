import { Repository } from 'typeorm';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { AttendanceEmployeeResolverService } from './attendance-employee-resolver.service';
import { AttendanceProcessingExceptionsService } from './attendance-processing-exceptions.service';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { AttendanceExceptionTypeEnum } from './enums/attendance-exception-type.enum';
import { AttendanceRawLogProcessingStatusEnum } from './enums/attendance-raw-log-processing-status.enum';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createRepositoryMock = <T>(): MockRepo<T> => ({
  findOne: jest.fn(),
  save: jest.fn(async (value) => value),
  update: jest.fn(async () => ({ affected: 1 })),
  create: jest.fn((value) => value),
  createQueryBuilder: jest.fn(),
});

const createQueryBuilderMock = (rows: HikvisionAttendanceLog[]) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]),
});

describe('AttendanceProcessingService', () => {
  let service: AttendanceProcessingService;
  let rawLogRepository: MockRepo<HikvisionAttendanceLog>;
  let processedEventRepository: MockRepo<AttendanceProcessedEvent>;
  let employeeResolver: { resolveEmployeeId: jest.Mock };
  let exceptionService: { replaceForRawLog: jest.Mock };
  let dailySummaryService: { rebuildSummariesForRange: jest.Mock };

  beforeEach(() => {
    rawLogRepository = createRepositoryMock();
    processedEventRepository = createRepositoryMock();
    employeeResolver = {
      resolveEmployeeId: jest.fn(),
    };
    exceptionService = {
      replaceForRawLog: jest.fn(async () => []),
    };
    dailySummaryService = {
      rebuildSummariesForRange: jest.fn(async () => ({
        summariesUpserted: 0,
        employeeCount: 0,
        daysComputed: 0,
      })),
    };

    service = new AttendanceProcessingService(
      rawLogRepository as Repository<HikvisionAttendanceLog>,
      processedEventRepository as Repository<AttendanceProcessedEvent>,
      employeeResolver as unknown as AttendanceEmployeeResolverService,
      exceptionService as unknown as AttendanceProcessingExceptionsService,
      dailySummaryService as unknown as AttendanceDailySummaryService,
    );
  });

  it('marks empty employee number raw logs as exceptions instead of dropping them', async () => {
    const rawLog = {
      id: 10,
      companyId: 5,
      branchId: 2,
      deviceId: 7,
      employeeNo: '',
      eventTime: new Date('2026-06-12T08:00:00Z'),
      eventType: 'ACCESS_CONTROL_EVENT',
      verifyMode: 'CARD',
      rawPayload: { employeeNoString: '' },
      processingAttempts: 0,
    } as HikvisionAttendanceLog;

    rawLogRepository.createQueryBuilder!.mockReturnValue(
      createQueryBuilderMock([rawLog]),
    );
    processedEventRepository.findOne!.mockResolvedValue(null);

    await service.processRange(5, {
      start_date: '2026-06-12',
      end_date: '2026-06-12',
      rebuild_summaries: false,
    });

    expect(employeeResolver.resolveEmployeeId).not.toHaveBeenCalled();
    expect(exceptionService.replaceForRawLog).toHaveBeenCalledWith(
      10,
      expect.arrayContaining([
        expect.objectContaining({
          exceptionType: AttendanceExceptionTypeEnum.EMPTY_EMPLOYEE_NO,
        }),
      ]),
    );
    expect(rawLogRepository.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        processingStatus: AttendanceRawLogProcessingStatusEnum.EXCEPTION,
      }),
    );
  });

  it('marks matched raw logs as processed', async () => {
    const rawLog = {
      id: 11,
      companyId: 5,
      branchId: 2,
      deviceId: 7,
      employeeNo: 'HIK-1001',
      eventTime: new Date('2026-06-12T08:00:00Z'),
      eventType: 'ACCESS_CONTROL_EVENT',
      verifyMode: 'FINGERPRINT',
      rawPayload: { employeeNoString: 'HIK-1001' },
      processingAttempts: 0,
    } as HikvisionAttendanceLog;

    rawLogRepository.createQueryBuilder!.mockReturnValue(
      createQueryBuilderMock([rawLog]),
    );
    processedEventRepository.findOne!.mockResolvedValue(null);
    employeeResolver.resolveEmployeeId.mockResolvedValue({
      employeeId: 101,
      reason: 'ASSIGNMENT_MAP',
    });

    await service.processRange(5, {
      start_date: '2026-06-12',
      end_date: '2026-06-12',
      rebuild_summaries: false,
    });

    expect(employeeResolver.resolveEmployeeId).toHaveBeenCalledWith(
      5,
      'HIK-1001',
      7,
    );
    expect(exceptionService.replaceForRawLog).toHaveBeenCalledWith(11, []);
    expect(rawLogRepository.update).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        processingStatus: AttendanceRawLogProcessingStatusEnum.PROCESSED,
      }),
    );
  });
});
