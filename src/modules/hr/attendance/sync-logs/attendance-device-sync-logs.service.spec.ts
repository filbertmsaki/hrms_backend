import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceSyncLogsService } from './attendance-device-sync-logs.service';
import { AttendanceDeviceSyncLog } from './entities/attendance-device-sync-log.entity';
import { AttendanceDeviceSyncLogStatusEnum } from './enums/attendance-device-sync-log-status.enum';
import { AttendanceDeviceSyncLogTypeEnum } from './enums/attendance-device-sync-log-type.enum';

type MockRepository<T extends object = Record<string, unknown>> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

function createRepositoryMock<T extends object>(): MockRepository<T> {
  return {
    create: jest.fn((value) => value),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function createQueryBuilderMock(items: AttendanceDeviceSyncLog[] = []) {
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([items, items.length]),
  };
  return builder;
}

describe('AttendanceDeviceSyncLogsService', () => {
  let syncLogRepo: MockRepository<AttendanceDeviceSyncLog>;
  let deviceRepo: MockRepository<AttendanceDevice>;
  let service: AttendanceDeviceSyncLogsService;

  const syncLog = (overrides: Partial<AttendanceDeviceSyncLog> = {}) =>
    ({
      id: overrides.id ?? 21,
      companyId: overrides.companyId ?? 1,
      deviceId: overrides.deviceId ?? 5,
      syncType: overrides.syncType ?? AttendanceDeviceSyncLogTypeEnum.MANUAL,
      status: overrides.status ?? AttendanceDeviceSyncLogStatusEnum.SUCCESS,
      startedAt: overrides.startedAt ?? new Date('2026-08-03T08:00:00Z'),
      completedAt: overrides.completedAt ?? new Date('2026-08-03T08:03:00Z'),
      recordsReceived: overrides.recordsReceived ?? 12,
      recordsProcessed: overrides.recordsProcessed ?? 11,
      failedRecords: overrides.failedRecords ?? 1,
      errorMessage: overrides.errorMessage ?? null,
      createdAt: overrides.createdAt ?? new Date('2026-08-03T08:04:00Z'),
    }) as AttendanceDeviceSyncLog;

  beforeEach(() => {
    syncLogRepo = createRepositoryMock<AttendanceDeviceSyncLog>();
    deviceRepo = createRepositoryMock<AttendanceDevice>();
    deviceRepo.findOne!.mockResolvedValue({ id: 5 });
    syncLogRepo.save!.mockImplementation(async (value) =>
      syncLog({
        ...value,
        id: 21,
        createdAt: new Date('2026-08-03T08:04:00Z'),
      }),
    );
    syncLogRepo.findOne!.mockImplementation(
      async (options?: { where?: { id?: number; companyId?: number } }) => {
        const where = options?.where;
        if (where?.id === 21 && where.companyId === 1) {
          return syncLog();
        }
        return null;
      },
    );

    service = new AttendanceDeviceSyncLogsService(
      syncLogRepo as Repository<AttendanceDeviceSyncLog>,
      deviceRepo as Repository<AttendanceDevice>,
    );
  });

  it('creates a device sync log only for a device owned by the active company', async () => {
    const result = await service.create(1, {
      device_id: 5,
      sync_type: AttendanceDeviceSyncLogTypeEnum.MANUAL,
      status: AttendanceDeviceSyncLogStatusEnum.PARTIAL,
      started_at: '2026-08-03T08:00:00.000Z',
      completed_at: '2026-08-03T08:03:00.000Z',
      records_received: 12,
      records_processed: 11,
      failed_records: 1,
      error_message: ' ',
    });

    expect(deviceRepo.findOne).toHaveBeenCalledWith({
      where: { id: 5, companyId: 1 },
    });
    expect(syncLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        deviceId: 5,
        syncType: AttendanceDeviceSyncLogTypeEnum.MANUAL,
        status: AttendanceDeviceSyncLogStatusEnum.PARTIAL,
        recordsReceived: 12,
        recordsProcessed: 11,
        failedRecords: 1,
        errorMessage: null,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 21,
        company_id: 1,
        device_id: 5,
        sync_type: AttendanceDeviceSyncLogTypeEnum.MANUAL,
        status: AttendanceDeviceSyncLogStatusEnum.PARTIAL,
        records_received: 12,
        records_processed: 11,
        failed_records: 1,
        error_message: null,
      }),
    );
  });

  it('rejects sync logs for devices outside the active company', async () => {
    deviceRepo.findOne!.mockResolvedValueOnce(null);

    await expect(
      service.create(1, {
        device_id: 5,
        sync_type: AttendanceDeviceSyncLogTypeEnum.AUTO,
        status: AttendanceDeviceSyncLogStatusEnum.SUCCESS,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'device_id does not belong to the active company',
      ),
    );
  });

  it('rejects invalid started and completed datetimes', async () => {
    await expect(
      service.create(1, {
        device_id: 5,
        sync_type: AttendanceDeviceSyncLogTypeEnum.AUTO,
        status: AttendanceDeviceSyncLogStatusEnum.SUCCESS,
        started_at: 'not-a-date',
      }),
    ).rejects.toThrow(
      new BadRequestException('started_at must be a valid datetime'),
    );

    await expect(
      service.create(1, {
        device_id: 5,
        sync_type: AttendanceDeviceSyncLogTypeEnum.AUTO,
        status: AttendanceDeviceSyncLogStatusEnum.SUCCESS,
        completed_at: 'not-a-date',
      }),
    ).rejects.toThrow(
      new BadRequestException('completed_at must be a valid datetime'),
    );
  });

  it('applies query filters and safe sorting when listing sync logs', async () => {
    const builder = createQueryBuilderMock([syncLog()]);
    syncLogRepo.createQueryBuilder!.mockReturnValue(builder);

    const result = await service.findAll(1, {
      page: 2,
      limit: 10,
      sortBy: 'not_allowed',
      device_id: 5,
      sync_type: AttendanceDeviceSyncLogTypeEnum.AUTO,
      status: AttendanceDeviceSyncLogStatusEnum.FAILED,
      from_date: '2026-08-01',
      to_date: '2026-08-31',
    });

    expect(builder.where).toHaveBeenCalledWith(
      'syncLog.company_id = :companyId',
      {
        companyId: 1,
      },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      'syncLog.device_id = :deviceId',
      { deviceId: 5 },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      'syncLog.sync_type = :syncType',
      { syncType: AttendanceDeviceSyncLogTypeEnum.AUTO },
    );
    expect(builder.andWhere).toHaveBeenCalledWith('syncLog.status = :status', {
      status: AttendanceDeviceSyncLogStatusEnum.FAILED,
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      'DATE(syncLog.started_at) >= :fromDate',
      { fromDate: '2026-08-01' },
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      'DATE(syncLog.started_at) <= :toDate',
      { toDate: '2026-08-31' },
    );
    expect(builder.orderBy).toHaveBeenCalledWith('syncLog.started_at', 'DESC');
    expect(builder.skip).toHaveBeenCalledWith(10);
    expect(builder.take).toHaveBeenCalledWith(10);
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 21,
        device_id: 5,
      }),
    ]);
  });

  it('returns one sync log only within the active company', async () => {
    await expect(service.findOne(1, 21)).resolves.toEqual(
      expect.objectContaining({
        id: 21,
        company_id: 1,
      }),
    );

    await expect(service.findOne(2, 21)).rejects.toThrow(
      new NotFoundException('Attendance device sync log not found'),
    );
  });
});
