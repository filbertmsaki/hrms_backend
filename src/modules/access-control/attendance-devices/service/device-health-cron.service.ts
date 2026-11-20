import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { AttendanceDevice } from '../entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../enums/attendance-device-status.enum';
import { AccessControlAttendanceDevicesService } from './attendance-devices.service';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { NotificationsService } from '../../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../../notifications/enums/notification-channel.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../../notifications/enums/notification-type.enum';

@Injectable()
export class DeviceHealthCronService {
  private readonly logger = new Logger(DeviceHealthCronService.name);
  constructor(
    @InjectRepository(AttendanceDevice)
    private readonly devices: Repository<AttendanceDevice>,
    private readonly service: AccessControlAttendanceDevicesService,
    private readonly lock: PostgresAdvisoryLockService,
    @InjectRepository(CompanyUser)
    private readonly users: Repository<CompanyUser>,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/10 * * * *')
  async checkDevices(): Promise<void> {
    await this.lock.runWithLock('attendance:device-health', async () => {
      const devices = await this.devices.find({
        where: {
          status: In([
            AttendanceDeviceStatusEnum.ACTIVE,
            AttendanceDeviceStatusEnum.OFFLINE,
          ]),
        },
        select: ['id', 'companyId'],
      });
      for (const device of devices) {
        try {
          await this.service.testConnection(device.companyId, device.id);
        } catch (error) {
          this.logger.warn(
            `Device ${device.id} connection check failed: ${(error as Error).message}`,
          );
          try {
            await this.alertOffline(device.companyId, device.id);
          } catch (alertError) {
            this.logger.warn(
              `Device ${device.id} alert failed: ${(alertError as Error).message}`,
            );
          }
        }
      }
    });
  }

  private async alertOffline(
    companyId: number,
    deviceId: number,
  ): Promise<void> {
    const device = await this.devices.findOne({
      where: { id: deviceId, companyId },
    });
    const operational = device?.metadata?.operational as
      | Record<string, unknown>
      | undefined;
    const health = operational?.connection_test as
      | Record<string, unknown>
      | undefined;
    if (
      !health ||
      Number(health.consecutive_failures) < 3 ||
      typeof health.failure_started_at !== 'string'
    )
      return;
    const recipients = await this.users
      .createQueryBuilder('companyUser')
      .leftJoin(
        'companyUser.permission_assignments',
        'directPermissionAssignment',
      )
      .leftJoin('directPermissionAssignment.permission', 'directPermission')
      .leftJoin('companyUser.role_assignments', 'roleAssignment')
      .leftJoin('roleAssignment.role', 'role')
      .leftJoin('role.permissions', 'rolePermission')
      .where('companyUser.company_id = :companyId', { companyId })
      .andWhere('companyUser.status = :activeStatus', {
        activeStatus: 'active',
      })
      .andWhere(
        '(directPermission.name = :permissionName OR rolePermission.name = :permissionName)',
        { permissionName: 'attendance_devices:update' },
      )
      .distinct(true)
      .getMany();
    if (!recipients.length)
      this.logger.warn(
        `No device administrator is configured for company ${companyId}.`,
      );
    for (const recipient of recipients) {
      await this.notifications.createAndPush({
        company_id: companyId,
        receiver_company_user_id: recipient.id,
        type: NotificationTypeEnum.SYSTEM_ALERT,
        category: NotificationCategoryEnum.SYSTEM,
        priority: NotificationPriorityEnum.HIGH,
        title: 'Attendance device connection needs attention',
        message: `Device ${device?.deviceName ?? deviceId} has failed three connection checks. Review the device connection.`,
        related_module: 'attendance',
        entity_type: 'ATTENDANCE_DEVICE_HEALTH',
        entity_id: deviceId,
        action_url: `/dashboard/attendance/devices/${deviceId}`,
        channels: [NotificationChannelEnum.IN_APP],
        dedupe_key: `attendance:device-health:${companyId}:${deviceId}:${health.failure_started_at}:${recipient.id}`,
      });
    }
  }
}
