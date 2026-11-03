import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { FeedbackForm, FeedbackParticipation } from './forms-feedback.entity';
import { FormsFeedbackService } from './forms-feedback.service';
@Injectable()
export class FormsFeedbackScheduler {
  private readonly logger = new Logger(FormsFeedbackScheduler.name);
  constructor(
    private readonly db: DataSource,
    private readonly service: FormsFeedbackService,
    private readonly locks: PostgresAdvisoryLockService,
    private readonly notifications: NotificationsService,
  ) {}
  @Cron('0 * * * * *')
  async tick() {
    await this.locks.runWithLock('forms-feedback-scheduler', async () => {
      const due = await this.db.getRepository(FeedbackForm).find({
        where: {
          status: 'scheduled',
          nextOpenAt: LessThanOrEqual(new Date()),
        },
        take: 100,
        order: { nextOpenAt: 'ASC' },
      });
      for (const form of due) {
        try {
          await this.service.openDueForm(form.id);
        } catch {
          this.logger.error(`Could not open form ${form.id}`);
        }
      }
      const recipients = await this.db.query<
        Array<{
          id: string;
          company_id: number;
          round_id: string;
          company_user_id: number;
          title: string;
          last_notified_at: Date | null;
        }>
      >(`SELECT p.id,p.company_id,p.round_id,e.company_user_id,r.definition->>'title' AS title,p.last_notified_at
        FROM feedback_participation p JOIN feedback_rounds r ON r.id=p.round_id AND r.company_id=p.company_id
        JOIN employees e ON e.id=p.employee_id AND e.company_id=p.company_id
        WHERE NOT p.submitted AND e.employment_status='active' AND e.company_user_id IS NOT NULL AND r.opens_at<=now() AND r.closes_at>now()
        AND (p.last_notified_at IS NULL OR ((r.definition->'schedule'->>'reminderDays')::int IS NOT NULL AND p.last_notified_at <= now() - make_interval(days => (r.definition->'schedule'->>'reminderDays')::int))) ORDER BY p.last_notified_at NULLS FIRST LIMIT 200`);
      for (const recipient of recipients) {
        try {
          // Recheck participation immediately before delivery; no answer data enters notifications.
          const participation = await this.db
            .getRepository(FeedbackParticipation)
            .findOneBy({ id: recipient.id, submitted: false });
          if (!participation) continue;
          await this.notifications.createAndPush({
            company_id: recipient.company_id,
            receiver_company_user_id: recipient.company_user_id,
            title: recipient.last_notified_at
              ? 'Reminder: form awaiting your response'
              : 'A form is ready for you',
            message: recipient.title,
            action_url: '/dashboard/forms-feedback',
            dedupe_key: `feedback:${recipient.id}:${recipient.last_notified_at ? new Date(recipient.last_notified_at).toISOString() : 'open'}`,
            related_module: 'forms_feedback',
            entity_type: 'feedback_round',
            entity_id: recipient.round_id,
          });
          await this.db
            .getRepository(FeedbackParticipation)
            .update(
              { id: recipient.id, submitted: false },
              { lastNotifiedAt: new Date() },
            );
        } catch {
          this.logger.error(
            `Could not deliver form notification ${recipient.id}`,
          );
        }
      }
    });
  }
}
