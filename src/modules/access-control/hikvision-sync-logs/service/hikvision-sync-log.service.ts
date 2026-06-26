import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPaginationMeta } from '../../../hr/shared/hr.utils';
import { HikvisionSyncLog } from '../entity/hikvision-sync-log.entity';
import { QueryHikvisionSyncLogDto } from '../dto/query-hikvision-sync-log.dto';

@Injectable()
export class HikvisionSyncLogService {
  constructor(
    @InjectRepository(HikvisionSyncLog)
    private readonly syncLogRepository: Repository<HikvisionSyncLog>,
  ) {}

  async findAll(companyId: number, query: QueryHikvisionSyncLogDto) {
    const {
      deviceId,
      syncType,
      direction,
      status,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
    } = query;

    const qb = this.syncLogRepository
      .createQueryBuilder('log')
      .where('log.company_id = :companyId', { companyId });

    if (deviceId) qb.andWhere('log.device_id = :deviceId', { deviceId });
    if (syncType) qb.andWhere('log.sync_type = :syncType', { syncType });
    if (direction) qb.andWhere('log.direction = :direction', { direction });
    if (status) qb.andWhere('log.status = :status', { status });
    if (dateFrom)
      qb.andWhere('log.started_at >= :dateFrom', { dateFrom: new Date(dateFrom) });
    if (dateTo)
      qb.andWhere('log.started_at <= :dateTo', { dateTo: new Date(dateTo) });

    const [items, total] = await qb
      .orderBy('log.started_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(companyId: number, id: number) {
    const row = await this.syncLogRepository.findOne({
      where: { id, companyId },
      relations: { device: true },
    });
    if (!row) {
      throw new NotFoundException('Sync log not found');
    }
    return this.map(row);
  }

  private map(item: HikvisionSyncLog) {
    return {
      id: item.id,
      company_id: item.companyId,
      device_id: item.deviceId,
      sync_type: item.syncType,
      direction: item.direction,
      status: item.status,
      started_at: item.startedAt,
      completed_at: item.completedAt,
      records_received: item.recordsReceived,
      records_processed: item.recordsProcessed,
      records_created: item.recordsCreated,
      records_updated: item.recordsUpdated,
      records_failed: item.recordsFailed,
      error_message: item.errorMessage,
      metadata: item.metadata,
      created_at: item.createdAt,
    };
  }
}
