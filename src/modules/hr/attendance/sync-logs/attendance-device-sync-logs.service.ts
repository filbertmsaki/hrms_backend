import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendanceDevice } from '../devices/entities/attendance-device.entity';
import { AttendanceDeviceSyncLog } from './entities/attendance-device-sync-log.entity';
import { AttendanceDeviceSyncLogQueryDto } from './dtos/attendance-device-sync-log-query.dto';
import { CreateAttendanceDeviceSyncLogDto } from './dtos/create-attendance-device-sync-log.dto';

@Injectable()
export class AttendanceDeviceSyncLogsService {
  constructor(
    @InjectRepository(AttendanceDeviceSyncLog)
    private readonly syncLogRepository: Repository<AttendanceDeviceSyncLog>,
    @InjectRepository(AttendanceDevice)
    private readonly deviceRepository: Repository<AttendanceDevice>,
  ) {}

  private map(item: AttendanceDeviceSyncLog) {
    return {
      id: item.id,
      company_id: item.companyId,
      device_id: item.deviceId,
      sync_type: item.syncType,
      status: item.status,
      started_at: item.startedAt,
      completed_at: item.completedAt,
      records_received: item.recordsReceived,
      records_processed: item.recordsProcessed,
      failed_records: item.failedRecords,
      error_message: item.errorMessage,
      created_at: item.createdAt,
    };
  }

  private async ensureDevice(companyId: number, deviceId: number): Promise<void> {
    const device = await this.deviceRepository.findOne({ where: { id: deviceId, companyId } });
    if (!device) {
      throw new BadRequestException('device_id does not belong to the active company');
    }
  }

  private async findOrFail(companyId: number, id: number): Promise<AttendanceDeviceSyncLog> {
    const item = await this.syncLogRepository.findOne({ where: { id, companyId } });
    if (!item) {
      throw new NotFoundException('Attendance device sync log not found');
    }
    return item;
  }

  async create(companyId: number, dto: CreateAttendanceDeviceSyncLogDto) {
    await this.ensureDevice(companyId, dto.device_id);

    const startedAt = dto.started_at ? new Date(dto.started_at) : new Date();
    const completedAt = dto.completed_at ? new Date(dto.completed_at) : null;

    if (Number.isNaN(startedAt.getTime())) {
      throw new BadRequestException('started_at must be a valid datetime');
    }

    if (completedAt && Number.isNaN(completedAt.getTime())) {
      throw new BadRequestException('completed_at must be a valid datetime');
    }

    const created = await this.syncLogRepository.save(
      this.syncLogRepository.create({
        companyId,
        deviceId: dto.device_id,
        syncType: dto.sync_type,
        status: dto.status,
        startedAt,
        completedAt,
        recordsReceived: dto.records_received ?? 0,
        recordsProcessed: dto.records_processed ?? 0,
        failedRecords: dto.failed_records ?? 0,
        errorMessage: dto.error_message?.trim() || null,
      }),
    );

    return this.map(created);
  }

  async findAll(companyId: number, query: AttendanceDeviceSyncLogQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'started_at',
      sortOrder = SortDirection.DESC,
      device_id,
      sync_type,
      status,
      from_date,
      to_date,
    } = query;

    const qb = this.syncLogRepository
      .createQueryBuilder('syncLog')
      .where('syncLog.company_id = :companyId', { companyId });

    if (device_id) {
      qb.andWhere('syncLog.device_id = :deviceId', { deviceId: device_id });
    }

    if (sync_type) {
      qb.andWhere('syncLog.sync_type = :syncType', { syncType: sync_type });
    }

    if (status) {
      qb.andWhere('syncLog.status = :status', { status });
    }

    if (from_date) {
      qb.andWhere('DATE(syncLog.started_at) >= :fromDate', { fromDate: from_date });
    }

    if (to_date) {
      qb.andWhere('DATE(syncLog.started_at) <= :toDate', { toDate: to_date });
    }

    const allowedSortFields = ['started_at', 'created_at', 'status'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'started_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const sortFieldMap: Record<string, string> = {
      started_at: 'started_at',
      created_at: 'created_at',
      status: 'status',
    };

    const [items, total] = await qb
      .orderBy(`syncLog.${sortFieldMap[safeSortBy]}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    return this.map(await this.findOrFail(companyId, id));
  }
}






