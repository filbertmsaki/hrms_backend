import { Injectable, Logger } from '@nestjs/common';
import { AttendanceEventIngestionService } from '../attendance-event-ingestion.service';
import { AttendanceProcessingService } from '../attendance-processing.service';

/**
 * Ensures a company's attendance for a single date is fully processed -
 * every source (device/Hikvision raw logs, mobile/manual punches) ingested
 * into processed events, and daily summaries rebuilt from them - right
 * before a report is generated for that date. Scheduled/manual attendance
 * reports must never read a partially-processed day.
 *
 * Mirrors what `AttendanceProcessingCronService` already does on its
 * interval, just run synchronously and scoped to one company/date so a
 * report never has to wait for the next cron tick.
 */
@Injectable()
export class AttendanceReportPreflightService {
  private readonly logger = new Logger(AttendanceReportPreflightService.name);

  constructor(
    private readonly eventIngestionService: AttendanceEventIngestionService,
    private readonly attendanceProcessingService: AttendanceProcessingService,
  ) {}

  /**
   * Best-effort: a processing hiccup must not block the report from
   * generating from whatever data is already available, so every step logs
   * and swallows its own errors rather than throwing.
   */
  async ensureFullyProcessed(
    companyId: number,
    reportDate: string,
  ): Promise<void> {
    await this.processPendingMobilePunches();
    await this.rebuildFromAllDeviceLogs(companyId, reportDate);
  }

  private async processPendingMobilePunches(): Promise<void> {
    try {
      const batchSize = Number(
        process.env.ATTENDANCE_MOBILE_EVENT_BATCH_SIZE ?? 200,
      );
      await this.eventIngestionService.processPendingMobilePunches(
        Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 200,
      );
    } catch (error) {
      this.logger.warn(
        `Pre-report mobile punch ingestion failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async rebuildFromAllDeviceLogs(
    companyId: number,
    reportDate: string,
  ): Promise<void> {
    try {
      // Unlike processIncrementalDate (which only touches PENDING/FAILED raw
      // logs), processRange reprocesses every raw log for the date - upserts
      // are keyed by source, so re-running it is safe - and always rebuilds
      // daily summaries for the whole date, catching drift from schedule or
      // policy changes that an incremental catch-up would miss.
      await this.attendanceProcessingService.processRange(companyId, {
        start_date: reportDate,
        end_date: reportDate,
        rebuild_summaries: true,
      });
    } catch (error) {
      this.logger.warn(
        `Pre-report attendance processing failed for company ${companyId} on ${reportDate}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
