import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { NotificationsService } from '../../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../../notifications/enums/notification-category.enum';
import { NotificationChannelEnum } from '../../../notifications/enums/notification-channel.enum';
import { NotificationPriorityEnum } from '../../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../../notifications/enums/notification-type.enum';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeConfirmationStatusEnum } from '../../employees/enums/employee-confirmation-status.enum';
import { ActionItemsService } from '../../action-inbox/action-items.service';
import { ActionItemTypeEnum } from '../../action-inbox/enums/action-item-type.enum';
import { formatDateOnly } from '../../shared/hr.utils';
import { ProbationCase } from '../entities/probation-case.entity';
import { ProbationReviewCycle } from '../entities/probation-review-cycle.entity';
import { ProbationCaseStatusEnum } from '../enums/probation-case-status.enum';
import { ProbationReviewCycleStatusEnum } from '../enums/probation-review-cycle-status.enum';

const PROBATION_REMINDERS_LOCK_KEY = 'probation:reminders';

@Injectable()
export class ProbationReminderService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProbationReminderService.name);

  constructor(
    @InjectRepository(ProbationCase)
    private readonly caseRepository: Repository<ProbationCase>,
    private readonly scheduler: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly actionItemsService: ActionItemsService,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    const job = CronJob.from({
      cronTime:
        this.configService.get<string>('PROBATION_REMINDER_CRON') ??
        CronExpression.EVERY_DAY_AT_7AM,
      onTick: () => this.run(),
    });
    this.scheduler.addCronJob(PROBATION_REMINDERS_LOCK_KEY, job);
    job.start();
  }

  async run(): Promise<void> {
    const { acquired } = await this.advisoryLockService.runWithLock(
      PROBATION_REMINDERS_LOCK_KEY,
      async () => {
        this.logger.log('Running probation reminder and due-date check');
        await this.sendUpcomingConfirmationReminders();
        await this.markReviewDueCases();
      },
    );

    if (!acquired) {
      this.logger.log(
        'Skipped probation reminder check: another worker holds the lock',
      );
    }
  }

  private reminderCutoff(hours: number): Date {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    return cutoff;
  }

  private async claimReminder(
    id: number,
    cutoffHours: number,
  ): Promise<boolean> {
    const cutoff = this.reminderCutoff(cutoffHours);
    const result = await this.caseRepository
      .createQueryBuilder()
      .update()
      .set({
        lastReminderAt: new Date(),
        reminderCount: () => '"reminder_count" + 1',
      } as never)
      .where('id = :id', { id })
      .andWhere('(last_reminder_at IS NULL OR last_reminder_at < :cutoff)', {
        cutoff,
      })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  private getReminderDays(): number[] {
    return (
      this.configService.get<number[]>('PROBATION_REMINDER_DAYS') ?? [
        30, 14, 7, 3, 1,
      ]
    );
  }

  private async sendUpcomingConfirmationReminders(): Promise<void> {
    const today = formatDateOnly(new Date());
    const reminderDays = this.getReminderDays();
    const maxWindow = Math.max(...reminderDays, 0);

    const cases = await this.caseRepository
      .createQueryBuilder('probationCase')
      .innerJoinAndSelect('probationCase.employee', 'employee')
      .where('probationCase.status IN (:...statuses)', {
        statuses: [
          ProbationCaseStatusEnum.ACTIVE,
          ProbationCaseStatusEnum.EXTENDED,
        ],
      })
      .andWhere('probationCase.current_due_date >= :today', { today })
      .getMany();

    for (const probationCase of cases) {
      const daysRemaining = this.daysBetween(
        today,
        probationCase.currentDueDate,
      );

      if (!reminderDays.includes(daysRemaining) || daysRemaining > maxWindow) {
        continue;
      }

      if (!(await this.claimReminder(probationCase.id, 20))) {
        continue;
      }

      if (probationCase.employee?.company_user_id) {
        await this.actionItemsService.upsertOpen({
          companyId: probationCase.companyId,
          assigneeCompanyUserId: probationCase.employee.company_user_id,
          assigneeEmployeeId: probationCase.employeeId,
          actionType: ActionItemTypeEnum.REMINDER,
          sourceModule: 'probation',
          sourceEntityType: 'PROBATION_CASE',
          sourceEntityId: probationCase.id,
          sourceKey: `probation:confirmation-due:${probationCase.id}:${daysRemaining}`,
          title: `Probation confirmation due in ${daysRemaining} day(s)`,
          actionUrl: '/dashboard/me/probation',
          dueAt: new Date(`${probationCase.currentDueDate}T00:00:00Z`),
        });

        await this.sendNotification({
          company_id: probationCase.companyId,
          receiver_company_user_id: probationCase.employee.company_user_id,
          type: NotificationTypeEnum.PROBATION_CONFIRMATION_DUE,
          category: NotificationCategoryEnum.HR,
          priority:
            daysRemaining <= 3
              ? NotificationPriorityEnum.HIGH
              : NotificationPriorityEnum.MEDIUM,
          title: `Probation confirmation due in ${daysRemaining} day(s)`,
          message: `Your probation confirmation is due on ${probationCase.currentDueDate}.`,
          related_module: 'probation',
          entity_type: 'PROBATION_CASE',
          entity_id: probationCase.id,
          action_url: '/dashboard/me/probation',
          channels: [
            NotificationChannelEnum.IN_APP,
            NotificationChannelEnum.EMAIL,
          ],
          dedupe_key: `probation:confirmation-due:notification:${probationCase.id}:${daysRemaining}:${probationCase.employee.company_user_id}`,
          metadata: {
            template_code: 'probation.confirmation_due',
            days_remaining: daysRemaining,
            due_date: probationCase.currentDueDate,
            employee_name: this.employeeName(probationCase.employee),
          },
        });
      }
    }
  }

  private async markReviewDueCases(): Promise<void> {
    const today = formatDateOnly(new Date());

    const due = {
      status: In([
        ProbationCaseStatusEnum.ACTIVE,
        ProbationCaseStatusEnum.EXTENDED,
      ]),
      currentDueDate: LessThanOrEqual(today),
    };
    const candidates = await this.caseRepository.find({
      where: due,
      select: { id: true },
    });
    for (const { id } of candidates) {
      const pending = await this.caseRepository.manager.transaction(
        async (manager) => {
          const cases = manager.getRepository(ProbationCase);
          const probationCase = await cases.findOne({
            where: { id, ...due },
            lock: { mode: 'pessimistic_write' },
          });
          if (!probationCase) return;
          const cycles = manager.getRepository(ProbationReviewCycle);
          const cycle = await cycles.findOneBy({
            probationCaseId: id,
            cycleNumber: probationCase.currentCycleNumber,
          });
          if (!cycle) {
            this.logger.warn(
              `Probation case ${id} is missing review cycle ${probationCase.currentCycleNumber}.`,
            );
            return;
          }
          const managerRequired =
            probationCase.policySnapshot?.manager_review_required !== false;
          if (cycle.selfAssessmentRequired) {
            probationCase.status =
              ProbationCaseStatusEnum.SELF_ASSESSMENT_PENDING;
            cycle.status =
              ProbationReviewCycleStatusEnum.SELF_ASSESSMENT_PENDING;
          } else if (managerRequired) {
            probationCase.status =
              ProbationCaseStatusEnum.MANAGER_REVIEW_PENDING;
            cycle.status =
              ProbationReviewCycleStatusEnum.MANAGER_REVIEW_PENDING;
          } else {
            probationCase.status = ProbationCaseStatusEnum.HR_REVIEW_PENDING;
            cycle.status = ProbationReviewCycleStatusEnum.HR_REVIEW_PENDING;
          }
          await cases.save(probationCase);
          await cycles.save(cycle);
          await manager
            .getRepository(Employee)
            .update(probationCase.employeeId, {
              confirmation_status:
                EmployeeConfirmationStatusEnum.CONFIRMATION_DUE,
            });
          if (
            probationCase.status ===
              ProbationCaseStatusEnum.MANAGER_REVIEW_PENDING &&
            probationCase.managerCompanyUserId
          ) {
            return {
              probationCase,
              cycle,
              reviewerId: probationCase.managerCompanyUserId,
            };
          }
        },
      );
      if (pending) {
        const { probationCase, cycle, reviewerId } = pending;
        await this.actionItemsService.upsertOpen({
          companyId: probationCase.companyId,
          assigneeCompanyUserId: reviewerId,
          actionType: ActionItemTypeEnum.APPROVAL,
          sourceModule: 'probation',
          sourceEntityType: 'PROBATION_CASE',
          sourceEntityId: probationCase.id,
          sourceKey: `probation:manager-review:${probationCase.id}:${cycle.id}:${reviewerId}`,
          title: 'Probation manager review required',
          actionUrl: `/dashboard/probation/team?case=${probationCase.id}`,
        });

        await this.sendNotification({
          company_id: probationCase.companyId,
          receiver_company_user_id: reviewerId,
          type: NotificationTypeEnum.PROBATION_CONFIRMATION_OVERDUE,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title: 'Probation manager review required',
          message:
            'A probation case has reached its confirmation date and needs your review.',
          related_module: 'probation',
          entity_type: 'PROBATION_CASE',
          entity_id: probationCase.id,
          action_url: `/dashboard/probation/team?case=${probationCase.id}`,
          channels: [
            NotificationChannelEnum.IN_APP,
            NotificationChannelEnum.EMAIL,
          ],
          dedupe_key: `probation:manager-review:notification:${probationCase.id}:${cycle.id}:${reviewerId}`,
          metadata: {
            template_code: 'probation.manager_review_required',
            due_date: probationCase.currentDueDate,
            employee_id: probationCase.employeeId,
          },
        });
      }
    }
  }

  private daysBetween(from: string, to: string): number {
    const fromDate = new Date(`${from}T00:00:00Z`).getTime();
    const toDate = new Date(`${to}T00:00:00Z`).getTime();
    return Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));
  }

  private employeeName(employee: Employee): string {
    return [employee.first_name, employee.middle_name, employee.last_name]
      .filter(Boolean)
      .join(' ');
  }

  private async sendNotification(
    input: Parameters<NotificationsService['createAndPush']>[0],
  ): Promise<void> {
    try {
      await this.notificationsService.createAndPush(input);
    } catch (error) {
      this.logger.error(
        'Failed to send probation notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
