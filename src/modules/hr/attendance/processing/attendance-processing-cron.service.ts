import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceProcessingService } from './attendance-processing.service';
import { AttendanceRecalculationService } from './attendance-recalculation.service';

@Injectable()
export class AttendanceProcessingCronService {
  private readonly logger = new Logger(AttendanceProcessingCronService.name);

  constructor(
    @InjectRepository(HikvisionAttendanceLog)
    private readonly rawLogRepository: Repository<HikvisionAttendanceLog>,
    private readonly processingService: AttendanceProcessingService,
    private readonly recalculationService: AttendanceRecalculationService,
  ) {}

  @Cron(process.env.ATTENDANCE_INCREMENTAL_CRON || '*/5 * * * *')
  async runIncrementalProcessing() {
    if (!this.isEnabled()) return;

    const today = this.formatDate(new Date());
    try {
      const rows = await this.rawLogRepository
        .createQueryBuilder('log')
        .select('DISTINCT log.company_id', 'companyId')
        .where('DATE(log.event_time) = :today', { today })
        .getRawMany<{ companyId: string }>();

      for (const row of rows) {
        const companyId = Number(row.companyId);
        if (!Number.isInteger(companyId) || companyId < 1) continue;

        await this.processingService.processRange(companyId, {
          start_date: today,
          end_date: today,
          rebuild_summaries: true,
        });
      }
    } catch (error) {
      this.logger.warn(`Incremental attendance processing skipped: ${(error as Error).message}`);
    }
  }

  @Cron(process.env.ATTENDANCE_RECALCULATION_CRON || '*/10 * * * *')
  async processPendingRecalculationJobs() {
    if (!this.isEnabled()) return;

    try {
      await this.recalculationService.processPendingJobs(20);
    } catch (error) {
      this.logger.warn(`Pending recalculation processing failed: ${(error as Error).message}`);
    }
  }

  private isEnabled() {
    const value = String(process.env.ATTENDANCE_PROCESSING_ENABLED ?? 'true').toLowerCase();
    return value !== 'false' && value !== '0' && value !== 'no';
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
