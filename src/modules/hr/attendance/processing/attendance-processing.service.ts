import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { AttendanceProcessedEventDirectionEnum } from './enums/attendance-processed-event-direction.enum';
import { AttendanceEmployeeResolverService } from './attendance-employee-resolver.service';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { ProcessAttendanceRangeDto } from './dtos/process-attendance-range.dto';

@Injectable()
export class AttendanceProcessingService {
  private readonly logger = new Logger(AttendanceProcessingService.name);

  constructor(
    @InjectRepository(HikvisionAttendanceLog)
    private readonly rawLogRepository: Repository<HikvisionAttendanceLog>,
    @InjectRepository(AttendanceProcessedEvent)
    private readonly processedEventRepository: Repository<AttendanceProcessedEvent>,
    private readonly employeeResolver: AttendanceEmployeeResolverService,
    private readonly dailySummaryService: AttendanceDailySummaryService,
  ) {}

  async processRange(companyId: number, dto: ProcessAttendanceRangeDto) {
    const startDate = this.normalizeDate(dto.start_date, 'start_date');
    const endDate = this.normalizeDate(dto.end_date, 'end_date');
    if (endDate < startDate) {
      throw new BadRequestException('end_date cannot be before start_date');
    }

    const batchSize = dto.batch_size ?? 500;
    const forceRebuild = dto.force_rebuild_summaries ?? false;
    const rebuildSummaries = dto.rebuild_summaries ?? true;

    const counters = {
      rawLogsScanned: 0,
      processedInserted: 0,
      processedSkipped: 0,
      processedFailed: 0,
      unmatchedEmployee: 0,
      summariesUpserted: 0,
    };

    let cursor = 0;

    while (true) {
      const qb = this.rawLogRepository
        .createQueryBuilder('log')
        .where('log.company_id = :companyId', { companyId })
        .andWhere('DATE(log.event_time) >= :startDate', { startDate })
        .andWhere('DATE(log.event_time) <= :endDate', { endDate })
        .andWhere('log.id > :cursor', { cursor })
        .orderBy('log.id', 'ASC')
        .take(batchSize);

      const rows = await qb.getMany();
      if (rows.length === 0) break;

      for (const row of rows) {
        counters.rawLogsScanned += 1;
        cursor = row.id;

        if (dto.employee_id) {
          const match = await this.employeeResolver.resolveEmployeeId(
            companyId,
            row.employeeNo,
            row.deviceId,
          );
          if (match.employeeId !== dto.employee_id) {
            counters.processedSkipped += 1;
            continue;
          }
        }

        const result = await this.processRawLog(companyId, row);
        counters.processedInserted += result.inserted;
        counters.processedSkipped += result.skipped;
        counters.processedFailed += result.failed;
        counters.unmatchedEmployee += result.unmatched;
      }
    }

    let summaryResult = {
      summariesUpserted: 0,
      employeeCount: 0,
      daysComputed: 0,
    };

    if (rebuildSummaries) {
      summaryResult = await this.dailySummaryService.rebuildSummariesForRange({
        companyId,
        startDate,
        endDate,
        employeeId: dto.employee_id,
        forceRebuild,
      });
      counters.summariesUpserted = summaryResult.summariesUpserted;
    }

    return {
      companyId,
      startDate,
      endDate,
      ...counters,
      summary: summaryResult,
      status: counters.processedFailed > 0 ? 'PARTIAL' : 'SUCCESS',
    };
  }

  private async processRawLog(companyId: number, rawLog: HikvisionAttendanceLog) {
    const counters = { inserted: 0, skipped: 0, failed: 0, unmatched: 0 };

    const exists = await this.processedEventRepository.findOne({ where: { rawLogId: rawLog.id } });
    if (exists) {
      counters.skipped += 1;
      return counters;
    }

    try {
      const resolution = await this.employeeResolver.resolveEmployeeId(
        companyId,
        rawLog.employeeNo,
        rawLog.deviceId,
      );

      if (!resolution.employeeId) {
        counters.unmatched += 1;
      }

      await this.processedEventRepository.save(
        this.processedEventRepository.create({
          companyId: rawLog.companyId,
          branchId: rawLog.branchId,
          employeeId: resolution.employeeId,
          employeeNo: rawLog.employeeNo,
          deviceId: rawLog.deviceId,
          rawLogId: rawLog.id,
          eventTime: rawLog.eventTime,
          attendanceDate: this.asDate(rawLog.eventTime),
          direction: AttendanceProcessedEventDirectionEnum.UNKNOWN,
          eventType: rawLog.eventType,
          verifyMode: rawLog.verifyMode,
          isValid: true,
          processingStatus: resolution.employeeId ? 'PROCESSED' : 'UNMATCHED_EMPLOYEE',
          processingReason: resolution.reason,
          rawPayloadSnapshot: rawLog.rawPayload,
        }),
      );
      counters.inserted += 1;
    } catch (error) {
      if (this.isDuplicateError(error)) {
        counters.skipped += 1;
      } else {
        counters.failed += 1;
        this.logger.warn(`Failed to process raw log ${rawLog.id}: ${(error as Error).message}`);
      }
    }

    return counters;
  }

  private normalizeDate(value: string, field: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return parsed.toISOString().slice(0, 10);
  }

  private asDate(value: Date): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  private isDuplicateError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const err = error as QueryFailedError & { code?: string; errno?: number };
    return err.code === 'ER_DUP_ENTRY' || err.errno === 1062;
  }
}
