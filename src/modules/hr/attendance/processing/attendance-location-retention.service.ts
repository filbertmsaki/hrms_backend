import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { AttendanceMobilePunch } from '../mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendanceRetentionGovernanceService } from './attendance-retention-governance.service';

@Injectable()
export class AttendanceLocationRetentionService {
  private readonly logger = new Logger(AttendanceLocationRetentionService.name);
  private readonly batchSize = 250;

  constructor(
    @InjectRepository(AttendanceMobilePunch)
    private readonly punchRepository: Repository<AttendanceMobilePunch>,
    private readonly configService: ConfigService,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
    @Optional()
    private readonly governance?: AttendanceRetentionGovernanceService,
  ) {}

  @Cron('0 15 3 * * *', { timeZone: 'Africa/Dar_es_Salaam' })
  async runScheduledRetention(): Promise<void> {
    const days = this.configService.get<number>(
      'ATTENDANCE_LOCATION_RETENTION_DAYS',
    );
    if (!days || days < 1) return;
    const cutoff = new Date(Date.now() - days * 86400000);
    const eligible = () =>
      this.punchRepository
        .createQueryBuilder('punch')
        .where('punch.created_at < :cutoff', { cutoff })
        .andWhere('punch.location_anonymized_at IS NULL')
        .andWhere(
          "(punch.latitude IS NOT NULL OR punch.longitude IS NOT NULL OR punch.accuracy_meters IS NOT NULL OR punch.distance_from_geofence_meters IS NOT NULL OR punch.wifi_ssid IS NOT NULL OR punch.wifi_bssid IS NOT NULL OR punch.ip_address IS NOT NULL OR punch.raw_payload ?| ARRAY['latitude', 'longitude', 'gps', 'location'])",
        )
        .andWhere(
          `NOT EXISTS (SELECT 1 FROM attendance_data_retention_holds hold WHERE hold.company_id = punch.company_id AND hold.category = 'ATTENDANCE_LOCATION' AND hold.record_id = punch.id AND hold.active = true)`,
        );
    const purgeEnabled =
      this.configService.get<boolean>(
        'ATTENDANCE_LOCATION_RETENTION_PURGE_ENABLED',
      ) ?? false;
    if (!purgeEnabled) {
      this.logger.warn(
        `Attendance location retention dry run: ${await eligible().getCount()} unheld record(s) exceed ${days} days.`,
      );
      return;
    }
    const approvals =
      (await this.governance?.getApprovedPurgeTargets(
        'ATTENDANCE_LOCATION',
        days,
      )) ?? [];
    if (!approvals.length) {
      this.logger.warn(
        'Attendance location purge is enabled but no company has a matching one-time approval.',
      );
      return;
    }
    const execution = await this.advisoryLockService.runWithLock(
      'attendance:location-retention',
      async () => {
        for (const approval of approvals) {
          const completed = await this.anonymizeCompany(
            approval.companyId,
            days,
          );
          if (completed) await this.governance!.markPurgeExecuted(approval.id);
        }
      },
    );
    if (!execution.acquired)
      this.logger.debug(
        'Attendance location retention is already running on another instance.',
      );
  }

  private async anonymizeCompany(
    companyId: number,
    days: number,
  ): Promise<boolean> {
    const cutoff = new Date(Date.now() - days * 86400000);
    let total = 0;
    try {
      while (true) {
        const rows = await this.punchRepository
          .createQueryBuilder('punch')
          .where('punch.company_id = :companyId', { companyId })
          .andWhere('punch.created_at < :cutoff', { cutoff })
          .andWhere('punch.location_anonymized_at IS NULL')
          .andWhere(
            "(punch.latitude IS NOT NULL OR punch.longitude IS NOT NULL OR punch.accuracy_meters IS NOT NULL OR punch.distance_from_geofence_meters IS NOT NULL OR punch.wifi_ssid IS NOT NULL OR punch.wifi_bssid IS NOT NULL OR punch.ip_address IS NOT NULL OR punch.raw_payload ?| ARRAY['latitude', 'longitude', 'gps', 'location'])",
          )
          .andWhere(
            `NOT EXISTS (SELECT 1 FROM attendance_data_retention_holds hold WHERE hold.company_id = punch.company_id AND hold.category = 'ATTENDANCE_LOCATION' AND hold.record_id = punch.id AND hold.active = true)`,
          )
          .orderBy('punch.id', 'ASC')
          .take(this.batchSize)
          .getMany();
        if (!rows.length) break;
        for (const punch of rows) {
          punch.latitude = null;
          punch.longitude = null;
          punch.accuracyMeters = null;
          punch.distanceFromGeofenceMeters = null;
          punch.wifiSsid = null;
          punch.wifiBssid = null;
          punch.ipAddress = null;
          punch.deviceInfo = null;
          punch.geofenceValidationResult = null;
          punch.wifiValidationResult = null;
          const payload =
            punch.rawPayload && typeof punch.rawPayload === 'object'
              ? { ...punch.rawPayload }
              : {};
          this.removeLocationFields(payload);
          payload.locationAnonymizedAt = new Date().toISOString();
          punch.rawPayload = payload;
          punch.locationAnonymizedAt = new Date();
        }
        await this.punchRepository.save(rows, { chunk: this.batchSize });
        total += rows.length;
      }
      this.logger.warn(
        `Anonymized attendance location for ${total} punch(es) in company ${companyId}, older than ${days} days.`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Attendance location anonymization failed for company ${companyId}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private removeLocationFields(value: Record<string, unknown>) {
    const locationKeys = new Set([
      'latitude',
      'longitude',
      'lat',
      'lng',
      'lon',
      'coords',
      'gps',
      'coordinates',
      'accuracyMeters',
      'accuracy_meters',
      'distanceFromGeofenceMeters',
      'distance_from_geofence_meters',
      'wifiSsid',
      'wifi_ssid',
      'wifiBssid',
      'wifi_bssid',
      'ipAddress',
      'ip_address',
      'deviceInfo',
      'device_info',
      'location',
    ]);
    for (const key of Object.keys(value)) {
      if (locationKeys.has(key)) delete value[key];
      else if (
        value[key] &&
        typeof value[key] === 'object' &&
        !Array.isArray(value[key])
      ) {
        this.removeLocationFields(value[key] as Record<string, unknown>);
      }
    }
  }
}
