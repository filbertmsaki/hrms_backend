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
import { CompanyUser } from '../../../companies/entities/company-user.entity';
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
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
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
      .andWhere(
        '(task.last_reminder_at IS NULL OR task.last_reminder_at < :reminderCutoff)',
        {
          reminderCutoff: new Date(
            Date.now() -
              this.configService.get<number>(
                'ONBOARDING_TASK_REMINDER_HOURS',
                24,
              ) *
                60 *
                60 *
                1000,
          ),
        },
      )
      .andWhere('req.status IN (:...reqStatuses)', {
        reqStatuses: activeStatuses,
      })
      .leftJoinAndSelect('task.onboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('task.workflow_step', 'workflowStep')
      .getMany();

    for (const task of overdueTasks) {
      const employeeName = task.onboarding_request?.employee
        ? `${task.onboarding_request.employee.first_name} ${task.onboarding_request.employee.last_name}`
        : 'Unknown';

      const recipientIds = await this.resolveTaskRecipientIds(task);
      for (const recipientId of recipientIds) {
        this.eventEmitter.emit(
          OnboardingTaskOverdueEvent.EVENT,
          new OnboardingTaskOverdueEvent(
            task.onboarding_request.company_id,
            task.onboarding_request_id,
            task.id,
            task.title,
            employeeName,
            recipientId,
            task.due_date!,
          ),
        );
      }

      if (recipientIds.length) {
        task.last_reminder_at = new Date();
        task.reminder_count += 1;
        await this.taskRepository.save(task);
      }
    }

    this.logger.log(`Emitted overdue events for ${overdueTasks.length} tasks`);
  }

  private async resolveTaskRecipientIds(
    task: OnboardingTask,
  ): Promise<number[]> {
    const conditions: string[] = [];
    const parameters: Record<string, number> = {
      companyId: task.onboarding_request.company_id,
    };
    const query = this.companyUserRepository
      .createQueryBuilder('companyUser')
      .where('companyUser.company_id = :companyId', parameters)
      .andWhere("LOWER(companyUser.status) = 'active'")
      .distinct(true);

    if (task.assigned_company_user_id) {
      conditions.push('companyUser.id = :assignedUserId');
      parameters.assignedUserId = task.assigned_company_user_id;
    } else if (task.assigned_department_id) {
      query
        .leftJoin('companyUser.employee', 'employee')
        .leftJoin('employee.department_assignments', 'departmentAssignment');
      conditions.push('employee.primary_department_id = :departmentId');
      conditions.push('departmentAssignment.department_id = :departmentId');
      parameters.departmentId = task.assigned_department_id;
    } else if (task.workflow_step?.assigned_role_id) {
      query.leftJoin('companyUser.role_assignments', 'roleAssignment');
      conditions.push('roleAssignment.role_id = :roleId');
      parameters.roleId = task.workflow_step.assigned_role_id;
    }

    if (!conditions.length) {
      return [];
    }

    const recipients = await query
      .andWhere(`(${conditions.join(' OR ')})`, parameters)
      .select('companyUser.id', 'id')
      .getRawMany<{ id: number | string }>();

    return recipients.map((recipient) => Number(recipient.id));
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
      .andWhere('approval.approval_level = req.current_approval_level')
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
