import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { AttendanceRetentionGovernanceService } from '../../attendance/processing/attendance-retention-governance.service';
import { FieldVisitLocationEvent } from '../entities/field-visit.entities';

@Injectable()
export class FieldLocationRetentionService {
  private readonly logger = new Logger(FieldLocationRetentionService.name);
  private readonly batchSize = 250;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(FieldVisitLocationEvent)
    private readonly repository: Repository<FieldVisitLocationEvent>,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
    private readonly retentionGovernance: AttendanceRetentionGovernanceService,
  ) {}

  @Cron('0 0 3 * * *')
  async processRetention() {
    const retentionDays = this.configService.get<number>(
      'FIELD_LOCATION_RETENTION_DAYS',
      730,
    );
    const anonymize = this.configService.get<boolean>(
      'FIELD_LOCATION_ANONYMIZE_AFTER_RETENTION',
      true,
    );

    if (retentionDays < 30) {
      return 0;
    }
    const eligible = () =>
      this.repository
        .createQueryBuilder('event')
        .where('event.captured_at < :cutoff', {
          cutoff: new Date(Date.now() - retentionDays * 86400000),
        })
        .andWhere('event.legal_hold = false')
        .andWhere(
          '(event.latitude IS NOT NULL OR event.longitude IS NOT NULL OR event.address IS NOT NULL OR event.device_info IS NOT NULL)',
        )
        .andWhere(
          `NOT EXISTS (SELECT 1 FROM attendance_data_retention_holds hold WHERE hold.company_id = event.company_id AND hold.category = 'FIELD_VISIT_LOCATION' AND hold.record_id = event.id AND hold.active = true)`,
        );
    if (!anonymize) {
      this.logger.warn(
        `Field visit location retention dry run: ${await eligible().getCount()} unheld record(s) exceed ${retentionDays} days.`,
      );
      return 0;
    }
    const approvals = await this.retentionGovernance.getApprovedPurgeTargets(
      'FIELD_VISIT_LOCATION',
      retentionDays,
    );
    if (!approvals.length) {
      this.logger.warn(
        'Field visit location anonymization is enabled but no company has a matching one-time approval.',
      );
      return 0;
    }
    let total = 0;
    const execution = await this.advisoryLockService.runWithLock(
      'field-visit:location-retention',
      async () => {
        for (const approval of approvals) {
          const anonymized = await this.anonymizeCompany(
            approval.companyId,
            retentionDays,
          );
          total += anonymized.count;
          if (anonymized.complete)
            await this.retentionGovernance.markPurgeExecuted(approval.id);
        }
      },
    );
    return execution.acquired ? total : 0;
  }

  private async anonymizeCompany(companyId: number, retentionDays: number) {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    let count = 0;
    try {
      while (true) {
        const events = await this.repository
          .createQueryBuilder('event')
          .where('event.company_id = :companyId', { companyId })
          .andWhere('event.captured_at < :cutoff', { cutoff })
          .andWhere('event.legal_hold = false')
          .andWhere(
            '(event.latitude IS NOT NULL OR event.longitude IS NOT NULL OR event.address IS NOT NULL OR event.device_info IS NOT NULL)',
          )
          .andWhere(
            `NOT EXISTS (SELECT 1 FROM attendance_data_retention_holds hold WHERE hold.company_id = event.company_id AND hold.category = 'FIELD_VISIT_LOCATION' AND hold.record_id = event.id AND hold.active = true)`,
          )
          .orderBy('event.id', 'ASC')
          .take(this.batchSize)
          .getMany();
        if (!events.length) break;
        const anonymizedAt = new Date().toISOString();
        for (const event of events) {
          event.latitude = null;
          event.longitude = null;
          event.accuracyMeters = null;
          event.distanceFromPlannedLocationMeters = null;
          event.address = null;
          event.addressStatus = 'ANONYMIZED';
          event.deviceInfo = null;
          event.locationValidationResult = {
            anonymized: true,
            anonymized_at: anonymizedAt,
          };
        }
        await this.repository.save(events, { chunk: this.batchSize });
        count += events.length;
      }
      return { count, complete: true };
    } catch (error) {
      this.logger.error(
        `Field visit location anonymization failed for company ${companyId}: ${(error as Error).message}`,
      );
      return { count, complete: false };
    }
  }
}
