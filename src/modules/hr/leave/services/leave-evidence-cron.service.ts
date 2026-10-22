import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { NotificationsService } from '../../../notifications/notifications.service';
import { NotificationChannelEnum } from '../../../notifications/enums/notification-channel.enum';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';

@Injectable()
export class LeaveEvidenceCronService {
  private readonly logger = new Logger(LeaveEvidenceCronService.name);
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly requests: Repository<LeaveRequest>,
    private readonly notifications: NotificationsService,
    private readonly locks: PostgresAdvisoryLockService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    await this.locks.runWithLock('leave:evidence-and-routing', async () => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 3 * 86400000);
      const requests = await this.requests
        .createQueryBuilder('r')
        .leftJoinAndSelect('r.employee', 'employee')
        .leftJoinAndSelect('r.approvals', 'approvals')
        .where('r.status IN (:...statuses)', {
          statuses: [
            LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
            LeaveStatusEnum.PENDING_HR,
            LeaveStatusEnum.APPROVED,
          ],
        })
        .andWhere(
          `(r.routing_required = true OR (r.evidence_required = true AND r.evidence_received_at IS NULL
          AND r.evidence_due_at <= :now AND (r.evidence_last_reminder_at IS NULL OR r.evidence_last_reminder_at <= :cutoff)))`,
          { now, cutoff },
        )
        .getMany();
      for (const request of requests) {
        try {
          await this.notify(request, now, cutoff);
        } catch (error) {
          this.logger.error(
            `Leave follow-up failed for request ${request.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    });
  }

  async notify(request: LeaveRequest, now: Date, cutoff: Date) {
    // Existence check also covers an upload whose request timestamp update was interrupted.
    const fresh = await this.requests.findOne({
      where: { id: request.id, company_id: request.company_id },
      relations: { documents: true, employee: true, approvals: true },
    });
    if (
      !fresh ||
      ![
        LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
        LeaveStatusEnum.PENDING_HR,
        LeaveStatusEnum.APPROVED,
      ].includes(fresh.status)
    )
      return;
    request = fresh;
    const appUrl = (this.config.get<string>('APP_FRONTEND_URL') ?? '').replace(
      /\/$/,
      '',
    );
    if (fresh.routing_required) {
      const recipients = new Set(
        (request.approvals ?? [])
          .filter(
            (a) =>
              a.approval_level === 2 &&
              a.approval_cycle === request.approval_cycle,
          )
          .map((a) => a.approver_company_user_id)
          .filter((id): id is number => !!id),
      );
      for (const id of recipients) {
        await this.notifications.createAndPush({
          company_id: request.company_id,
          receiver_company_user_id: id,
          type: 'LEAVE_ROUTING_REQUIRED',
          category: NotificationCategoryEnum.HR,
          title: 'Leave manager assignment needed',
          message: `Leave ${request.leave_no} is waiting for a manager assignment. Correct the assignment and retry routing before approval can begin.`,
          related_module: 'leave',
          entity_type: 'LEAVE_REQUEST',
          entity_id: request.id,
          action_url: `${appUrl}/dashboard/leave-management/requests?highlight=${request.id}`,
          channels: [
            NotificationChannelEnum.IN_APP,
            NotificationChannelEnum.EMAIL,
          ],
          dedupe_key: `leave:routing:${request.id}:${request.approval_cycle}:${id}`,
        });
      }
    }
    if (
      !request.evidence_required ||
      request.evidence_received_at ||
      !request.evidence_due_at ||
      new Date(request.evidence_due_at) > now ||
      (request.evidence_last_reminder_at &&
        new Date(request.evidence_last_reminder_at) > cutoff) ||
      !request.employee.company_user_id
    )
      return;
    if (
      fresh.evidence_received_at ||
      fresh.documents?.length ||
      !fresh.evidence_due_at ||
      new Date(fresh.evidence_due_at) > now
    )
      return;
    const due = new Date(fresh.evidence_due_at).toISOString();
    const slot = Math.floor(
      (now.getTime() - new Date(due).getTime()) / (3 * 86400000),
    );
    await this.notifications.createAndPush({
      company_id: request.company_id,
      receiver_company_user_id: request.employee.company_user_id,
      type: 'LEAVE_EVIDENCE_REQUIRED',
      category: NotificationCategoryEnum.HR,
      title: 'Leave supporting document needed',
      message: `Please upload the supporting document for leave ${request.leave_no}. It was due ${due.slice(0, 10)}.`,
      related_module: 'leave',
      entity_type: 'LEAVE_REQUEST',
      entity_id: request.id,
      action_url: `${appUrl}/dashboard/me/leave/requests?highlight=${request.id}`,
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
      dedupe_key: `leave:evidence:${request.id}:${due}:${slot}`,
    });
    // Delivery is persisted in the notification outbox before this timestamp advances.
    await this.requests.update(
      {
        id: request.id,
        evidence_due_at: fresh.evidence_due_at,
        evidence_received_at: IsNull(),
      },
      { evidence_last_reminder_at: now },
    );
    this.logger.log(
      `Queued evidence reminder for leave request ${request.id} to employee membership ${request.employee.company_user_id} (repeat slot ${slot})`,
    );
  }
}
