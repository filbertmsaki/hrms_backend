import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import { NotificationPreferencesService } from '../../notifications/notification-preferences.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { KpiPeriod } from './kpi.entities';

/** A period announcement is informational; it does not assign a KPI or open an evaluation. */
@Injectable()
export class KpiPeriodNotificationService {
  private readonly logger = new Logger(KpiPeriodNotificationService.name);
  private readonly batchSize = 200;

  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  async broadcast(period: KpiPeriod): Promise<void> {
    let afterId = 0;
    while (true) {
      let batch: Employee[];
      try {
        batch = await this.employees.find({
          where: {
            id: MoreThan(afterId),
            company_id: period.companyId,
            employment_status: In([
              EmploymentStatusEnum.ACTIVE,
              EmploymentStatusEnum.ONBOARDING,
            ]),
            company_user: { status: 'active', company_id: period.companyId },
          },
          select: { id: true, company_user_id: true },
          order: { id: 'ASC' },
          take: this.batchSize,
        });
      } catch (error) {
        this.logger.error(
          `Period ${period.id} recipient lookup failed: ${(error as Error).message}`,
        );
        return;
      }
      if (!batch.length) return;

      for (let offset = 0; offset < batch.length; offset += 20) {
        await Promise.all(
          batch
            .slice(offset, offset + 20)
            .map((employee) => this.notifyEmployee(period, employee)),
        );
      }
      afterId = batch[batch.length - 1].id;
      if (batch.length < this.batchSize) return;
    }
  }

  private async notifyEmployee(period: KpiPeriod, employee: Employee) {
    if (!employee.company_user_id) return;
    try {
      const selected = await this.preferences.findMine(
        employee.company_user_id,
      );
      const periodPreferences = selected.filter(
        (preference) =>
          preference.notificationType ===
            NotificationTypeEnum.KPI_PERIOD_CREATED && preference.isEnabled,
      );
      const channels = periodPreferences.length
        ? periodPreferences.map((preference) => preference.channel)
        : [NotificationChannelEnum.IN_APP];
      await this.notifications.createAndPush({
        company_id: period.companyId,
        receiver_company_user_id: employee.company_user_id,
        type: NotificationTypeEnum.KPI_PERIOD_CREATED,
        category: NotificationCategoryEnum.HR,
        title: 'New KPI reporting period',
        message: `${period.label} (${period.startDate} to ${period.endDate}) is available. Check My KPIs for any assignments.`,
        related_module: 'kpi',
        entity_type: 'kpi_period',
        entity_id: period.id,
        action_url: '/dashboard/me/kpi',
        event_key: 'kpi.period.created',
        dedupe_key: `kpi:period:created:${period.id}:${employee.company_user_id}`,
        channels,
      });
    } catch (error) {
      // The period has already committed. Keep it usable and retain a
      // recipient identifier for operational retry without logging PII.
      this.logger.error(
        `Period ${period.id} notification failed for membership ${employee.company_user_id}: ${(error as Error).message}`,
      );
    }
  }
}
