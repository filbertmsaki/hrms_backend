import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import { NotificationsService } from '../../notifications/notifications.service';
import { KpiAssignment, KpiDefinitionVersion, KpiPeriod } from './kpi.entities';

@Injectable()
export class KpiAssignmentNotificationService {
  private readonly logger = new Logger(KpiAssignmentNotificationService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly notifications: NotificationsService,
  ) {}

  async notify(
    assignment: KpiAssignment & {
      definitionVersion: KpiDefinitionVersion;
      period: KpiPeriod;
    },
  ): Promise<void> {
    if (assignment.subjectType !== 'employee') return;
    try {
      const employee = await this.employees.findOne({
        where: {
          id: assignment.subjectId,
          company_id: assignment.companyId,
          company_user: { status: 'active', company_id: assignment.companyId },
        },
      });
      if (!employee?.company_user_id) return;
      await this.notifications.createAndPush({
        company_id: assignment.companyId,
        receiver_company_user_id: employee.company_user_id,
        type: NotificationTypeEnum.KPI_ASSIGNED,
        category: NotificationCategoryEnum.HR,
        title: 'KPI assigned to you',
        message: `${assignment.definitionVersion.name} has been assigned to you for ${assignment.period.label} (${assignment.period.startDate} to ${assignment.period.endDate}).`,
        related_module: 'kpi',
        entity_type: 'kpi_assignment',
        entity_id: assignment.id,
        action_url: `/dashboard/me/kpi/${assignment.id}`,
        event_key: 'kpi.assignment.created',
        dedupe_key: `kpi:assignment:created:${assignment.id}:${employee.company_user_id}`,
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
          NotificationChannelEnum.SMS,
          NotificationChannelEnum.PUSH,
        ],
      });
    } catch (error) {
      // The assignment has committed. A notification outage must not make
      // the client retry a successful assignment and create a conflict.
      this.logger.error(
        `Assignment ${assignment.id} notification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
