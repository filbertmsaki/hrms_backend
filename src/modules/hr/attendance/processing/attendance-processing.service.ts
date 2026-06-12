import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { AttendanceProcessedEventDirectionEnum } from './enums/attendance-processed-event-direction.enum';
import { AttendanceEmployeeResolverService } from './attendance-employee-resolver.service';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { ProcessAttendanceRangeDto } from './dtos/process-attendance-range.dto';
import { formatDateOnly, normalizeDateInput } from '../../shared/hr.utils';

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
      processedUpdated: 0,
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
        counters.processedUpdated += result.updated;
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
    const counters = { inserted: 0, updated: 0, skipped: 0, failed: 0, unmatched: 0 };

    try {
      const resolution = await this.employeeResolver.resolveEmployeeId(
        companyId,
        rawLog.employeeNo,
        rawLog.deviceId,
      );

      if (!resolution.employeeId) {
        counters.unmatched += 1;
      }

      const existing = await this.processedEventRepository.findOne({
        where: { rawLogId: rawLog.id },
      });

      if (existing) {
        const didUpdate = await this.applyProcessedEventChanges(
          existing,
          rawLog,
          resolution,
        );

        if (didUpdate) {
          counters.updated += 1;
        } else {
          counters.skipped += 1;
        }

        return counters;
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

  private async applyProcessedEventChanges(
    existing: AttendanceProcessedEvent,
    rawLog: HikvisionAttendanceLog,
    resolution: { employeeId: number | null; reason: string },
  ): Promise<boolean> {
    const nextAttendanceDate = this.asDate(rawLog.eventTime);
    const nextProcessingStatus = resolution.employeeId
      ? 'PROCESSED'
      : 'UNMATCHED_EMPLOYEE';
    let changed = false;

    const assign = <K extends keyof AttendanceProcessedEvent>(
      key: K,
      value: AttendanceProcessedEvent[K],
    ) => {
      const current = existing[key];
      const isSameDate =
        current instanceof Date &&
        value instanceof Date &&
        current.getTime() === value.getTime();

      if (!isSameDate && current !== value) {
        existing[key] = value;
        changed = true;
      }
    };

    assign('companyId', rawLog.companyId);
    assign('branchId', rawLog.branchId);
    assign('employeeId', resolution.employeeId);
    assign('employeeNo', rawLog.employeeNo);
    assign('deviceId', rawLog.deviceId);
    assign('eventTime', rawLog.eventTime);
    assign('attendanceDate', nextAttendanceDate);
    assign('eventType', rawLog.eventType);
    assign('verifyMode', rawLog.verifyMode);
    assign('isValid', true);
    assign('processingStatus', nextProcessingStatus);
    assign('processingReason', resolution.reason);

    const currentPayload = JSON.stringify(existing.rawPayloadSnapshot ?? null);
    const nextPayload = JSON.stringify(rawLog.rawPayload ?? null);
    if (currentPayload !== nextPayload) {
      existing.rawPayloadSnapshot = rawLog.rawPayload;
      changed = true;
    }

    if (!changed) {
      return false;
    }

    await this.processedEventRepository.save(existing);
    return true;
  }

  private normalizeDate(value: string, field: string): string {
    try {
      return normalizeDateInput(value, field);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private asDate(value: Date): string {
    return formatDateOnly(new Date(value));
  }

  private isDuplicateError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const err = error as QueryFailedError & { code?: string; errno?: number };
    return err.code === 'ER_DUP_ENTRY' || err.errno === 1062;
  }
}
