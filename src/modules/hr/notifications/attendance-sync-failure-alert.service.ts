import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { HikvisionSyncLog } from '../../access-control/hikvision-sync-logs/entity/hikvision-sync-log.entity';
import { HikvisionSyncLogDirectionEnum } from '../../access-control/hikvision-sync-logs/enum/hikvision-sync-log-direction.enum';
import { HikvisionSyncLogStatusEnum } from '../../access-control/hikvision-sync-logs/enum/hikvision-sync-log-status.enum';
import { HikvisionSyncLogTypeEnum } from '../../access-control/hikvision-sync-logs/enum/hikvision-sync-log-type.enum';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import { NotificationPriorityEnum } from '../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class AttendanceSyncFailureAlertService {
  private readonly logger = new Logger(AttendanceSyncFailureAlertService.name);
  private readonly alertLookbackMinutes = 65;

  constructor(
    @InjectRepository(HikvisionSyncLog)
    private readonly syncLogRepository: Repository<HikvisionSyncLog>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async scanRecentFailures(now = new Date()): Promise<void> {
    const since = new Date(
      now.getTime() - this.alertLookbackMinutes * 60 * 1000,
    );
    const failedRuns = await this.syncLogRepository
      .createQueryBuilder('syncLog')
      .where('syncLog.sync_type = :syncType', {
        syncType: HikvisionSyncLogTypeEnum.ATTENDANCE,
      })
      .andWhere('syncLog.direction = :direction', {
        direction: HikvisionSyncLogDirectionEnum.PULL,
      })
      .andWhere('syncLog.status IN (:...statuses)', {
        statuses: [
          HikvisionSyncLogStatusEnum.FAILED,
          HikvisionSyncLogStatusEnum.PARTIAL,
        ],
      })
      .andWhere('syncLog.started_at >= :since', { since })
      .orderBy('syncLog.started_at', 'DESC')
      .take(100)
      .getMany();

    for (const failedRun of failedRuns) {
      await this.alertRun(failedRun);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyScan(): Promise<void> {
    try {
      await this.scanRecentFailures();
    } catch (error) {
      this.logger.error(
        'Failed to scan Hikvision attendance sync failures',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async alertRun(failedRun: HikvisionSyncLog): Promise<void> {
    const recipients = await this.companyUserRepository
      .createQueryBuilder('companyUser')
      .leftJoin(
        'companyUser.permission_assignments',
        'directPermissionAssignment',
      )
      .leftJoin('directPermissionAssignment.permission', 'directPermission')
      .leftJoin('companyUser.role_assignments', 'roleAssignment')
      .leftJoin('roleAssignment.role', 'role')
      .leftJoin('role.permissions', 'rolePermission')
      .where('companyUser.company_id = :companyId', {
        companyId: failedRun.companyId,
      })
      .andWhere('companyUser.status = :activeStatus', {
        activeStatus: 'active',
      })
      .andWhere(
        '(directPermission.name = :permissionName OR rolePermission.name = :permissionName)',
        { permissionName: 'access_control_sync:execute' },
      )
      .distinct(true)
      .getMany();

    if (!recipients.length) {
      this.logger.warn(
        `No active access_control_sync:execute recipient is configured for company ${failedRun.companyId}; sync log ${failedRun.id} remains available in attendance sync history.`,
      );
      return;
    }

    for (const recipient of recipients) {
      try {
        await this.notificationsService.createAndPush({
          company_id: failedRun.companyId,
          receiver_company_user_id: recipient.id,
          type: NotificationTypeEnum.SYSTEM_ALERT,
          category: NotificationCategoryEnum.SYSTEM,
          priority: NotificationPriorityEnum.HIGH,
          title: 'Hikvision attendance sync needs attention',
          message: `Attendance sync ${failedRun.status.toLowerCase()} for device ${failedRun.deviceId ?? 'unknown'}. Review sync history and retry the affected time range after resolving the cause.`,
          related_module: 'attendance',
          entity_type: 'HIKVISION_ATTENDANCE_SYNC',
          entity_id: failedRun.id,
          action_url: '/dashboard/attendance/device-sync-logs',
          channels: [NotificationChannelEnum.IN_APP],
          dedupe_key: `attendance:sync-failure:${failedRun.id}:${recipient.id}`,
          metadata: {
            sync_log_id: failedRun.id,
            device_id: failedRun.deviceId,
            status: failedRun.status,
            started_at: failedRun.startedAt.toISOString(),
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to notify attendance sync owner for sync log ${failedRun.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
