import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeConfirmationStatusEnum } from '../../employees/enums/employee-confirmation-status.enum';
import {
  ActionItemsService,
} from '../../action-inbox/action-items.service';
import { ActionItemTypeEnum } from '../../action-inbox/enums/action-item-type.enum';
import { formatDateOnly } from '../../shared/hr.utils';
import { ProbationCase } from '../entities/probation-case.entity';
import { ProbationReviewCycle } from '../entities/probation-review-cycle.entity';
import { ProbationCaseStatusEnum } from '../enums/probation-case-status.enum';
import { ProbationReviewCycleStatusEnum } from '../enums/probation-review-cycle-status.enum';

const PROBATION_REMINDERS_LOCK_KEY = 'probation:reminders';

@Injectable()
export class ProbationReminderService {
  private readonly logger = new Logger(ProbationReminderService.name);

  constructor(
    @InjectRepository(ProbationCase)
    private readonly caseRepository: Repository<ProbationCase>,
    @InjectRepository(ProbationReviewCycle)
    private readonly cycleRepository: Repository<ProbationReviewCycle>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly configService: ConfigService,
    private readonly actionItemsService: ActionItemsService,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
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

  private async claimReminder(id: number, cutoffHours: number): Promise<boolean> {
    const cutoff = this.reminderCutoff(cutoffHours);
    const result = await this.caseRepository
      .createQueryBuilder()
      .update()
      .set({
        lastReminderAt: new Date(),
        reminderCount: () => '"reminder_count" + 1',
      } as never)
      .where('id = :id', { id })
      .andWhere(
        '(last_reminder_at IS NULL OR last_reminder_at < :cutoff)',
        { cutoff },
      )
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
      const daysRemaining = this.daysBetween(today, probationCase.currentDueDate);

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
          actionUrl: '/me/probation',
          dueAt: new Date(`${probationCase.currentDueDate}T00:00:00Z`),
        });
      }
    }
  }

  private async markReviewDueCases(): Promise<void> {
    const today = formatDateOnly(new Date());

    const cases = await this.caseRepository
      .createQueryBuilder('probationCase')
      .where('probationCase.status IN (:...statuses)', {
        statuses: [
          ProbationCaseStatusEnum.ACTIVE,
          ProbationCaseStatusEnum.EXTENDED,
        ],
      })
      .andWhere('probationCase.current_due_date <= :today', { today })
      .getMany();

    for (const probationCase of cases) {
      const selfRequired = Boolean(
        (probationCase.policySnapshot as { self_assessment_required?: boolean })
          ?.self_assessment_required,
      );

      probationCase.status = selfRequired
        ? ProbationCaseStatusEnum.SELF_ASSESSMENT_PENDING
        : ProbationCaseStatusEnum.MANAGER_REVIEW_PENDING;

      await this.caseRepository.save(probationCase);

      const cycle = await this.cycleRepository.findOne({
        where: {
          probationCaseId: probationCase.id,
          cycleNumber: probationCase.currentCycleNumber,
        },
      });

      if (cycle) {
        cycle.status = selfRequired
          ? ProbationReviewCycleStatusEnum.SELF_ASSESSMENT_PENDING
          : ProbationReviewCycleStatusEnum.MANAGER_REVIEW_PENDING;
        await this.cycleRepository.save(cycle);

        if (!selfRequired && probationCase.managerCompanyUserId) {
          await this.actionItemsService.upsertOpen({
            companyId: probationCase.companyId,
            assigneeCompanyUserId: probationCase.managerCompanyUserId,
            actionType: ActionItemTypeEnum.APPROVAL,
            sourceModule: 'probation',
            sourceEntityType: 'PROBATION_CASE',
            sourceEntityId: probationCase.id,
            sourceKey: `probation:manager-review:${probationCase.id}:${cycle.id}:${probationCase.managerCompanyUserId}`,
            title: 'Probation manager review required',
            actionUrl: `/probation/cases/${probationCase.id}`,
          });
        }
      }

      await this.employeeRepository.update(probationCase.employeeId, {
        confirmation_status: EmployeeConfirmationStatusEnum.CONFIRMATION_DUE,
      });
    }
  }

  private daysBetween(from: string, to: string): number {
    const fromDate = new Date(`${from}T00:00:00Z`).getTime();
    const toDate = new Date(`${to}T00:00:00Z`).getTime();
    return Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));
  }
}
