import { ConfigService } from '@nestjs/config';
import { AttendanceRawLogRetentionService } from './attendance-raw-log-retention.service';
import { AttendanceRawLogProcessingStatusEnum } from './enums/attendance-raw-log-processing-status.enum';

describe('AttendanceRawLogRetentionService', () => {
  const createBuilder = () => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
    getRawMany: jest.fn(),
  });

  const buildService = (days: number, purgeEnabled: boolean) => {
    const countBuilder = createBuilder();
    const deleteBuilder = createBuilder();
    const repository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(countBuilder)
        .mockReturnValue(deleteBuilder),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'ATTENDANCE_RAW_LOG_RETENTION_DAYS'
          ? days
          : key === 'ATTENDANCE_RAW_LOG_RETENTION_PURGE_ENABLED'
            ? purgeEnabled
            : undefined,
      ),
    };
    const lock = {
      runWithLock: jest.fn(async (_key, callback) => ({
        acquired: true,
        result: await callback(),
      })),
    };
    return {
      service: new AttendanceRawLogRetentionService(
        repository as never,
        config as unknown as ConfigService,
        lock as never,
      ),
      repository,
      countBuilder,
      deleteBuilder,
      lock,
    };
  };

  it('does not query or delete logs when no approved retention period is configured', async () => {
    const { service, repository, lock } = buildService(0, false);
    await service.runScheduledRetention();
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    expect(lock.runWithLock).not.toHaveBeenCalled();
  });

  it('only reports eligible processed logs in dry-run mode', async () => {
    const { service, repository, countBuilder } = buildService(180, false);
    countBuilder.getCount.mockResolvedValue(6);
    await service.runScheduledRetention();
    expect(countBuilder.andWhere).toHaveBeenCalledWith(
      'log.processing_status = :status',
      { status: AttendanceRawLogProcessingStatusEnum.PROCESSED },
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('purges only processed log ids in bounded batches when explicitly enabled', async () => {
    const { service, repository, countBuilder, deleteBuilder } = buildService(
      180,
      true,
    );
    countBuilder.getCount.mockResolvedValue(2);
    deleteBuilder.getRawMany.mockResolvedValueOnce([{ id: 12 }, { id: 15 }]);
    await service.runScheduledRetention();
    expect(deleteBuilder.andWhere).toHaveBeenCalledWith(
      'log.processing_status = :status',
      { status: AttendanceRawLogProcessingStatusEnum.PROCESSED },
    );
    expect(repository.delete).toHaveBeenCalledWith([12, 15]);
  });
});
