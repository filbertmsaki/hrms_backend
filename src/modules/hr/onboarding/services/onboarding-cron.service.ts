import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { OnboardingTask } from '../entities/onboarding-task.entity';
import { OnboardingApproval } from '../entities/onboarding-approval.entity';
import { OnboardingRequest } from '../entities/onboarding-request.entity';
import { OnboardingTaskStatusEnum } from '../enums/onboarding-task-status.enum';
import { OnboardingApprovalStatusEnum } from '../enums/onboarding-approval-status.enum';
import { OnboardingRequestStatusEnum } from '../enums/onboarding-request-status.enum';
import {
  OnboardingApprovalReminderEvent,
  OnboardingTaskOverdueEvent,
} from '../../notifications/events';

@Injectable()
export class OnboardingCronService {
  private readonly logger = new Logger(OnboardingCronService.name);

  constructor(
    @InjectRepository(OnboardingTask)
    private readonly taskRepository: Repository<OnboardingTask>,
    @InjectRepository(OnboardingApproval)
    private readonly approvalRepository: Repository<OnboardingApproval>,
    @InjectRepository(OnboardingRequest)
    private readonly requestRepository: Repository<OnboardingRequest>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleOverdueTasksAndStaleApprovals() {
    this.logger.log('Running onboarding escalation check');
    await Promise.allSettled([
      this.notifyOverdueTasks(),
      this.notifyStaleApprovals(),
    ]);
  }

  private async notifyOverdueTasks() {
    const activeStatuses = [
      OnboardingRequestStatusEnum.SUBMITTED,
      OnboardingRequestStatusEnum.IN_PROGRESS,
      OnboardingRequestStatusEnum.IN_REVIEW,
    ];

    const overdueTasks = await this.taskRepository
      .createQueryBuilder('task')
      .innerJoin('task.onboarding_request', 'req')
      .where('task.status IN (:...taskStatuses)', {
        taskStatuses: [
          OnboardingTaskStatusEnum.PENDING,
          OnboardingTaskStatusEnum.IN_PROGRESS,
        ],
      })
      .andWhere('task.due_date < NOW()')
      .andWhere('req.status IN (:...reqStatuses)', {
        reqStatuses: activeStatuses,
      })
      .leftJoinAndSelect('task.onboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .getMany();

    for (const task of overdueTasks) {
      const employeeName = task.onboarding_request?.employee
        ? `${task.onboarding_request.employee.first_name} ${task.onboarding_request.employee.last_name}`
        : 'Unknown';

      this.eventEmitter.emit(
        OnboardingTaskOverdueEvent.EVENT,
        new OnboardingTaskOverdueEvent(
          task.onboarding_request.company_id,
          task.onboarding_request_id,
          task.id,
          task.title,
          employeeName,
          task.assigned_company_user_id,
          task.due_date!,
        ),
      );
    }

    this.logger.log(`Emitted overdue events for ${overdueTasks.length} tasks`);
  }

  private async notifyStaleApprovals() {
    const reminderDays = this.configService.get<number>(
      'ONBOARDING_APPROVAL_REMINDER_DAYS',
      2,
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - reminderDays);

    const activeStatuses = [
      OnboardingRequestStatusEnum.SUBMITTED,
      OnboardingRequestStatusEnum.IN_PROGRESS,
      OnboardingRequestStatusEnum.IN_REVIEW,
    ];

    const staleApprovals = await this.approvalRepository
      .createQueryBuilder('approval')
      .innerJoin('approval.onboarding_request', 'req')
      .where('approval.status = :status', {
        status: OnboardingApprovalStatusEnum.PENDING,
      })
      .andWhere('approval.created_at < :cutoff', { cutoff })
      .andWhere('req.status IN (:...reqStatuses)', {
        reqStatuses: activeStatuses,
      })
      .leftJoinAndSelect('approval.onboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .getMany();

    for (const approval of staleApprovals) {
      const employeeName = approval.onboarding_request?.employee
        ? `${approval.onboarding_request.employee.first_name} ${approval.onboarding_request.employee.last_name}`
        : 'Unknown';

      this.eventEmitter.emit(
        OnboardingApprovalReminderEvent.EVENT,
        new OnboardingApprovalReminderEvent(
          approval.onboarding_request.company_id,
          approval.onboarding_request_id,
          approval.id,
          approval.approval_level,
          employeeName,
          approval.approver_company_user_id
            ? [approval.approver_company_user_id]
            : [],
        ),
      );
    }

    this.logger.log(
      `Emitted reminder events for ${staleApprovals.length} stale approvals`,
    );
  }
}
