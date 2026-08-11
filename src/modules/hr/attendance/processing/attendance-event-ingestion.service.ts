import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AttendanceMobilePunch } from '../mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendancePunchTypeEnum } from '../mobile-punches/enums/attendance-punch-type.enum';
import { AttendancePunchValidationStatusEnum } from '../mobile-punches/enums/attendance-punch-validation-status.enum';
import { AttendanceDailySummaryService } from './attendance-daily-summary.service';
import { AttendanceProcessedEvent } from './entities/attendance-processed-event.entity';
import { AttendanceEventSourceEnum } from './enums/attendance-event-source.enum';
import { AttendanceProcessedEventDirectionEnum } from './enums/attendance-processed-event-direction.enum';

@Injectable()
export class AttendanceEventIngestionService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(AttendanceMobilePunch)
    private readonly mobilePunchRepository: Repository<AttendanceMobilePunch>,
    @InjectRepository(AttendanceProcessedEvent)
    private readonly processedEventRepository: Repository<AttendanceProcessedEvent>,
    private readonly dailySummaryService: AttendanceDailySummaryService,
  ) {}

  async ingestMobilePunch(
    companyId: number,
    mobilePunchId: number,
  ): Promise<AttendanceProcessedEvent> {
    const result = await this.dataSource.transaction(async (manager) => {
      const punchRepository = manager.getRepository(AttendanceMobilePunch);
      const eventRepository = manager.getRepository(AttendanceProcessedEvent);

      const punch = await punchRepository
        .createQueryBuilder('punch')
        .setLock('pessimistic_write')
        .where('punch.id = :id', { id: mobilePunchId })
        .andWhere('punch.company_id = :companyId', { companyId })
        .getOne();

      if (!punch) {
        throw new NotFoundException('Attendance mobile punch not found');
      }

      if (
        ![
          AttendancePunchValidationStatusEnum.APPROVED,
          AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
        ].includes(punch.validationStatus)
      ) {
        throw new BadRequestException(
          'Only approved attendance punches may be processed',
        );
      }

      const sourceKey = `MOBILE:${punch.id}`;
      let event = await eventRepository.findOne({
        where: { sourceKey },
      });

      if (!event) {
        event = await eventRepository.save(
          eventRepository.create({
            companyId: punch.companyId,
            branchId: punch.branchId,
            employeeId: punch.employeeId,
            employeeNo: '',
            deviceId: null,
            rawLogId: null,
            mobilePunchId: punch.id,
            source: AttendanceEventSourceEnum.MOBILE,
            sourceId: punch.id,
            sourceKey,
            eventTime: punch.punchTime,
            attendanceDate: punch.attendanceDate,
            direction:
              punch.punchType === AttendancePunchTypeEnum.CHECK_IN
                ? AttendanceProcessedEventDirectionEnum.IN
                : AttendanceProcessedEventDirectionEnum.OUT,
            eventType: punch.punchType,
            verifyMode: 'MOBILE_APP',
            isValid: true,
            processingStatus: 'PROCESSED',
            processingReason: punch.validationStatus,
            payloadHash: punch.payloadHash,
            rawPayloadSnapshot: punch.rawPayload,
            receivedAt: punch.receivedAt,
            processingVersion: 1,
          }),
        );
      }

      punch.isProcessed = true;
      punch.processedEventId = event.id;
      punch.processingAttempts += 1;
      punch.lastProcessingError = null;
      await punchRepository.save(punch);

      return {
        event,
        employeeId: punch.employeeId,
        attendanceDate: punch.attendanceDate,
      };
    });

    await this.dailySummaryService.recomputeForEmployeeDate(
      companyId,
      result.employeeId,
      result.attendanceDate,
    );

    return result.event;
  }

  async processPendingMobilePunches(limit = 200) {
    const punches = await this.mobilePunchRepository
      .createQueryBuilder('punch')
      .where('punch.is_processed = false')
      .andWhere('punch.validation_status IN (:...statuses)', {
        statuses: [
          AttendancePunchValidationStatusEnum.APPROVED,
          AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
        ],
      })
      .orderBy('punch.punch_time', 'ASC')
      .addOrderBy('punch.id', 'ASC')
      .take(limit)
      .getMany();

    let processed = 0;
    let failed = 0;

    for (const punch of punches) {
      try {
        await this.ingestMobilePunch(punch.companyId, punch.id);
        processed += 1;
      } catch (error) {
        failed += 1;
        await this.mobilePunchRepository.update(punch.id, {
          processingAttempts: (punch.processingAttempts ?? 0) + 1,
          lastProcessingError:
            error instanceof Error
              ? error.message
              : 'Mobile punch processing failed',
        });
      }
    }

    return {
      selected: punches.length,
      processed,
      failed,
    };
  }
}
