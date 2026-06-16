import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceProcessingExceptionsService } from './attendance-processing-exceptions.service';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { AttendanceProcessedEventDirectionEnum } from './enums/attendance-processed-event-direction.enum';
import { AttendanceExceptionTypeEnum } from './enums/attendance-exception-type.enum';
import { AttendanceRawLogProcessingStatusEnum } from './enums/attendance-raw-log-processing-status.enum';
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
    private readonly exceptionService: AttendanceProcessingExceptionsService,
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
    const nextProcessingAttempt = (rawLog.processingAttempts ?? 0) + 1;

    try {
      const normalizedEmployeeNo = rawLog.employeeNo.trim();
      const resolution = normalizedEmployeeNo
        ? await this.employeeResolver.resolveEmployeeId(
            companyId,
            normalizedEmployeeNo,
            rawLog.deviceId,
          )
        : { employeeId: null, reason: 'EMPTY_EMPLOYEE_NO' };
      const isMatched = !!resolution.employeeId;
      const isValid = isMatched && normalizedEmployeeNo.length > 0;
      const nextProcessingStatus = isMatched
        ? 'PROCESSED'
        : resolution.reason === 'EMPTY_EMPLOYEE_NO'
          ? 'EMPTY_EMPLOYEE_NO'
          : 'UNMATCHED_EMPLOYEE';
      const nextRawLogStatus = isMatched
        ? AttendanceRawLogProcessingStatusEnum.PROCESSED
        : resolution.reason === 'EMPTY_EMPLOYEE_NO'
          ? AttendanceRawLogProcessingStatusEnum.EXCEPTION
          : AttendanceRawLogProcessingStatusEnum.UNMATCHED_EMPLOYEE;

      if (!isMatched) {
        counters.unmatched += 1;
      }

      const existing = await this.processedEventRepository.findOne({
        where: { rawLogId: rawLog.id },
      });

      let processedEvent: AttendanceProcessedEvent;
      if (existing) {
        processedEvent = existing;
        const didUpdate = await this.applyProcessedEventChanges(
          existing,
          rawLog,
          {
            employeeId: resolution.employeeId,
            reason: resolution.reason,
            isValid,
            processingStatus: nextProcessingStatus,
          },
        );

        if (didUpdate) {
          counters.updated += 1;
        } else {
          counters.skipped += 1;
        }

      } else {
        processedEvent = await this.processedEventRepository.save(
          this.processedEventRepository.create({
          companyId: rawLog.companyId,
          branchId: rawLog.branchId,
          employeeId: resolution.employeeId,
          employeeNo: rawLog.employeeNo,
          deviceId: rawLog.deviceId,
          rawLogId: rawLog.id,
          eventTime: rawLog.eventTime,
          attendanceDate: this.asDate(rawLog.eventTime),
          direction: this.inferDirection(rawLog),
          eventType: rawLog.eventType,
          verifyMode: rawLog.verifyMode,
          isValid,
          processingStatus: nextProcessingStatus,
          processingReason: resolution.reason,
          rawPayloadSnapshot: rawLog.rawPayload,
          }),
        );
        counters.inserted += 1;
      }

      const rawLogExceptions = isMatched
        ? []
        : [
            {
              companyId: rawLog.companyId,
              branchId: rawLog.branchId,
              employeeId: resolution.employeeId,
              rawLogId: rawLog.id,
              processedEventId: processedEvent.id,
              deviceId: rawLog.deviceId,
              employeeNo: rawLog.employeeNo,
              attendanceDate: this.asDate(rawLog.eventTime),
              exceptionType:
                resolution.reason === 'EMPTY_EMPLOYEE_NO'
                  ? AttendanceExceptionTypeEnum.EMPTY_EMPLOYEE_NO
                  : AttendanceExceptionTypeEnum.UNRESOLVED_EMPLOYEE,
              message:
                resolution.reason === 'EMPTY_EMPLOYEE_NO'
                  ? 'Raw attendance log has no employee number from device.'
                  : 'Raw attendance log could not be linked to a local employee.',
              metadata: {
                raw_log_id: rawLog.id,
                employee_no: rawLog.employeeNo,
                resolver_reason: resolution.reason,
              },
            },
          ];

      await this.exceptionService.replaceForRawLog(rawLog.id, rawLogExceptions);

      await this.rawLogRepository.update(rawLog.id, {
        processingStatus: nextRawLogStatus,
        processingAttempts: nextProcessingAttempt,
        processedAt: new Date(),
        lastProcessingError: null,
      });
    } catch (error) {
      try {
        await this.rawLogRepository.update(rawLog.id, {
          processingStatus: AttendanceRawLogProcessingStatusEnum.FAILED,
          processingAttempts: nextProcessingAttempt,
          lastProcessingError: (error as Error).message,
        });
      } catch {
        // status update failure is non-fatal; original error is handled below
      }
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
    resolution: {
      employeeId: number | null;
      reason: string;
      isValid: boolean;
      processingStatus: string;
    },
  ): Promise<boolean> {
    const nextAttendanceDate = this.asDate(rawLog.eventTime);
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
    assign('direction', this.inferDirection(rawLog));
    assign('eventType', rawLog.eventType);
    assign('verifyMode', rawLog.verifyMode);
    assign('isValid', resolution.isValid);
    assign('processingStatus', resolution.processingStatus);
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

  /**
   * Derives punch direction from the raw Hikvision event fields.
   *
   * Hikvision minor event codes used for attendance:
   *   1  = Check-in (card)          75 = Check-in (no card)
   *   2  = Check-out (card)         76 = Check-out (no card)
   *   3  = Break-start              4  = Break-end
   *
   * Falls back to the device-reported attendanceStatus string, then UNKNOWN.
   */
  private inferDirection(rawLog: HikvisionAttendanceLog): AttendanceProcessedEventDirectionEnum {
    const checkInMinors  = new Set([1, 3, 75]);
    const checkOutMinors = new Set([2, 4, 76]);

    if (typeof rawLog.minor === 'number') {
      if (checkInMinors.has(rawLog.minor))  return AttendanceProcessedEventDirectionEnum.IN;
      if (checkOutMinors.has(rawLog.minor)) return AttendanceProcessedEventDirectionEnum.OUT;
    }

    const status = (rawLog.attendanceStatus ?? '').toLowerCase().replace(/[\s_-]/g, '');
    if (status.includes('checkin')  || status === 'in')  return AttendanceProcessedEventDirectionEnum.IN;
    if (status.includes('checkout') || status === 'out') return AttendanceProcessedEventDirectionEnum.OUT;

    return AttendanceProcessedEventDirectionEnum.UNKNOWN;
  }

  private isDuplicateError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const err = error as QueryFailedError & { code?: string; errno?: number };
    return err.code === 'ER_DUP_ENTRY' || err.errno === 1062;
  }
}
