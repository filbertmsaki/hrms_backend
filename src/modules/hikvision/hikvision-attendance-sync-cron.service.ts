import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceDevice } from '../access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../access-control/attendance-devices/enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../access-control/attendance-devices/enums/attendance-device-sync-mode.enum';
import { HikvisionAttendanceSyncService } from './hikvision-attendance-sync.service';

@Injectable()
export class HikvisionAttendanceSyncCronService {
  private readonly logger = new Logger(HikvisionAttendanceSyncCronService.name);

  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly deviceRepository: Repository<AttendanceDevice>,
    private readonly attendanceSyncService: HikvisionAttendanceSyncService,
  ) {}

  @Cron('*/10 * * * *')
  async syncAttendance(): Promise<void> {
    const automaticRange = this.resolveAutomaticSyncRange();
    const devices = await this.deviceRepository
      .createQueryBuilder('device')
      .where('device.status = :status', {
        status: AttendanceDeviceStatusEnum.ACTIVE,
      })
      .andWhere('device.sync_mode = :syncMode', {
        syncMode: AttendanceDeviceSyncModeEnum.PULL,
      })
      .andWhere(
        "(LOWER(device.integration_type) = :integrationType OR LOWER(COALESCE(device.vendor_name, '')) LIKE :vendor)",
        {
          integrationType: 'hikvision',
          vendor: '%hikvision%',
        },
      )
      .getMany();

    if (!devices.length) {
      return;
    }

    this.logger.log(
      `Starting automatic attendance sync for ${devices.length} Hikvision device(s)`,
    );
    if (automaticRange.startTime || automaticRange.endTime) {
      this.logger.log(
        `Automatic attendance sync range limit enabled: start=${automaticRange.startTime ?? 'auto'}, end=${automaticRange.endTime ?? 'auto'}`,
      );
    }

    for (const device of devices) {
      try {
        const result =
          await this.attendanceSyncService.syncLatestAttendanceWindow(
            device.companyId,
            device.id,
            automaticRange,
          );

        if (result.status === 'SKIPPED') {
          this.logger.debug(
            `Skipped automatic attendance sync for device ${device.id}: ${result.reason}`,
          );
          continue;
        }

        this.logger.log(
          `Automatic attendance sync completed for device ${device.id} with status ${result.status}`,
        );
      } catch (error) {
        this.logger.error(
          `Automatic attendance sync failed for device ${device.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  private resolveAutomaticSyncRange(): {
    startTime?: string;
    endTime?: string;
  } {
    const startTime = this.readEnvValue('HIKVISION_AUTO_SYNC_START_TIME');
    const endTime = this.readEnvValue('HIKVISION_AUTO_SYNC_END_TIME');

    return {
      startTime: startTime ?? undefined,
      endTime: endTime ?? undefined,
    };
  }

  private readEnvValue(name: string): string | null {
    const value = process.env[name];
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
  }
}
