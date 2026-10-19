import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceRawLogProcessingStatusEnum } from './enums/attendance-raw-log-processing-status.enum';
import { AttendanceRetentionGovernanceService } from './attendance-retention-governance.service';

@Injectable()
export class AttendanceRawLogRetentionService {
  private readonly logger = new Logger(AttendanceRawLogRetentionService.name);
  private readonly batchSize = 500;

  constructor(
    @InjectRepository(HikvisionAttendanceLog)
    private readonly logRepository: Repository<HikvisionAttendanceLog>,
    private readonly configService: ConfigService,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
    @Optional()
    private readonly retentionGovernance?: AttendanceRetentionGovernanceService,
  ) {}

  @Cron('0 0 3 * * *', { timeZone: 'Africa/Dar_es_Salaam' })
  async runScheduledRetention(): Promise<void> {
    const days = this.configService.get<number>(
      'ATTENDANCE_RAW_LOG_RETENTION_DAYS',
    );
    if (!days || days < 1) {
      this.logger.warn(
        'Raw Hikvision attendance log retention is disabled until an approved ATTENDANCE_RAW_LOG_RETENTION_DAYS value is configured.',
      );
      return;
    }

    const purgeEnabled =
      this.configService.get<boolean>(
        'ATTENDANCE_RAW_LOG_RETENTION_PURGE_ENABLED',
      ) ?? false;
    if (!purgeEnabled) {
      const eligibleCount = await this.logRepository
        .createQueryBuilder('log')
        .where('log.event_time < :cutoff', {
          cutoff: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        })
        .andWhere('log.processing_status = :status', {
          status: AttendanceRawLogProcessingStatusEnum.PROCESSED,
        })
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM attendance_data_retention_holds hold
            WHERE hold.company_id = log.company_id
              AND hold.category = 'RAW_HIKVISION_LOG'
              AND hold.record_id = log.id
              AND hold.active = true
          )`,
        )
        .getCount();
      this.logger.warn(
        `Attendance raw-log retention is in dry-run mode: ${eligibleCount} unheld processed log(s) exceed ${days} days.`,
      );
      return;
    }

    const approvals =
      (await this.retentionGovernance?.getApprovedPurgeTargets(
        'RAW_HIKVISION_LOG',
        days,
      )) ?? [];
    if (!approvals.length) {
      this.logger.warn(
        'Attendance raw-log purge is enabled but no company has a matching one-time purge approval; no logs were deleted.',
      );
      return;
    }

    const execution = await this.advisoryLockService.runWithLock(
      'attendance:raw-log-retention',
      async () => {
        for (const approval of approvals) {
          await this.applyRetention(days, approval.companyId);
          await this.retentionGovernance!.markPurgeExecuted(approval.id);
        }
      },
    );
    if (!execution.acquired) {
      this.logger.debug(
        'Attendance raw-log retention is already running on another application instance.',
      );
    }
  }

  private async applyRetention(days: number, companyId: number): Promise<void> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let deleted = 0;
    while (true) {
      const rows = await this.logRepository
        .createQueryBuilder('log')
        .select('log.id', 'id')
        .where('log.company_id = :companyId', { companyId })
        .andWhere('log.event_time < :cutoff', { cutoff })
        .andWhere('log.processing_status = :status', {
          status: AttendanceRawLogProcessingStatusEnum.PROCESSED,
        })
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM attendance_data_retention_holds hold
            WHERE hold.company_id = log.company_id
              AND hold.category = 'RAW_HIKVISION_LOG'
              AND hold.record_id = log.id
              AND hold.active = true
          )`,
        )
        .orderBy('log.id', 'ASC')
        .take(this.batchSize)
        .getRawMany<{ id: number | string }>();
      const ids = rows
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id) && id > 0);
      if (!ids.length) break;

      const result = await this.logRepository.delete(ids);
      deleted += result.affected ?? 0;
      if (ids.length < this.batchSize) break;
    }

    this.logger.warn(
      `Attendance raw-log retention purged ${deleted} unheld processed log(s) for company ${companyId} older than ${days} days; related processed-event raw-log references are nulled by the database.`,
    );
  }
}
