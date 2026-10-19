import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceRawLogProcessingStatusEnum } from './enums/attendance-raw-log-processing-status.enum';

@Injectable()
export class AttendanceRawLogRetentionService {
  private readonly logger = new Logger(AttendanceRawLogRetentionService.name);
  private readonly batchSize = 500;

  constructor(
    @InjectRepository(HikvisionAttendanceLog)
    private readonly logRepository: Repository<HikvisionAttendanceLog>,
    private readonly configService: ConfigService,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
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

    const execution = await this.advisoryLockService.runWithLock(
      'attendance:raw-log-retention',
      () => this.applyRetention(days),
    );
    if (!execution.acquired) {
      this.logger.debug(
        'Attendance raw-log retention is already running on another application instance.',
      );
    }
  }

  private async applyRetention(days: number): Promise<void> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const candidates = this.logRepository
      .createQueryBuilder('log')
      .where('log.event_time < :cutoff', { cutoff })
      .andWhere('log.processing_status = :status', {
        status: AttendanceRawLogProcessingStatusEnum.PROCESSED,
      });
    const candidateCount = await candidates.getCount();
    const purgeEnabled =
      this.configService.get<boolean>(
        'ATTENDANCE_RAW_LOG_RETENTION_PURGE_ENABLED',
      ) ?? false;

    if (!purgeEnabled) {
      this.logger.warn(
        `Attendance raw-log retention is in dry-run mode: ${candidateCount} processed log(s) are older than ${days} days; cutoff=${cutoff.toISOString()}.`,
      );
      return;
    }

    let deleted = 0;
    while (true) {
      const rows = await this.logRepository
        .createQueryBuilder('log')
        .select('log.id', 'id')
        .where('log.event_time < :cutoff', { cutoff })
        .andWhere('log.processing_status = :status', {
          status: AttendanceRawLogProcessingStatusEnum.PROCESSED,
        })
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
      `Attendance raw-log retention purged ${deleted} processed log(s) older than ${days} days; related processed-event raw-log references are nulled by the database.`,
    );
  }
}
