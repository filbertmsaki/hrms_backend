import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { OffboardingApprovalStatusEnum } from '../enums/offboarding-approval-status.enum';
import { OffboardingClearanceStatusEnum } from '../enums/offboarding-clearance-status.enum';
import { OffboardingRequestStatusEnum } from '../enums/offboarding-request-status.enum';
import { OffboardingTaskStatusEnum } from '../enums/offboarding-task-status.enum';
import { OffboardingApproval } from '../entities/offboarding-approval.entity';
import { OffboardingClearance } from '../entities/offboarding-clearance.entity';
import { OffboardingTask } from '../entities/offboarding-task.entity';
import {
  OffboardingApprovalReminderEvent,
  OffboardingClearanceOverdueEvent,
  OffboardingTaskOverdueEvent,
} from '../../notifications/events';

@Injectable()
export class OffboardingCronService {
  private readonly logger = new Logger(OffboardingCronService.name);

  constructor(
    @InjectRepository(OffboardingTask)
    private readonly taskRepository: Repository<OffboardingTask>,
    @InjectRepository(OffboardingClearance)
    private readonly clearanceRepository: Repository<OffboardingClearance>,
    @InjectRepository(OffboardingApproval)
    private readonly approvalRepository: Repository<OffboardingApproval>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleOffboardingEscalations() {
    this.logger.log('Running offboarding SLA and escalation check');
    await Promise.allSettled([
      this.notifyOverdueTasks(),
      this.notifyOverdueClearances(),
      this.notifyStaleApprovals(),
    ]);
  }

  private getActiveRequestStatuses(): OffboardingRequestStatusEnum[] {
    return [
      OffboardingRequestStatusEnum.PENDING,
      OffboardingRequestStatusEnum.WAITING_APPROVAL,
      OffboardingRequestStatusEnum.IN_PROGRESS,
      OffboardingRequestStatusEnum.APPROVED,
    ];
  }

  private async notifyOverdueTasks() {
    const frontendUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      'http://localhost:5173';
    const overdueTasks = await this.taskRepository
      .createQueryBuilder('task')
      .innerJoin('task.offboarding_request', 'req')
      .leftJoinAndSelect('task.assigned_to_company_user', 'assignedMembership')
      .leftJoinAndSelect('assignedMembership.user', 'assignedUser')
      .leftJoinAndSelect('task.offboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .where('task.status IN (:...taskStatuses)', {
        taskStatuses: [
          OffboardingTaskStatusEnum.PENDING,
          OffboardingTaskStatusEnum.IN_PROGRESS,
        ],
      })
      .andWhere('task.due_date IS NOT NULL')
      .andWhere('task.due_date < NOW()')
      .andWhere('req.status IN (:...reqStatuses)', {
        reqStatuses: this.getActiveRequestStatuses(),
      })
      .getMany();

    for (const task of overdueTasks) {
      if (!task.assigned_to_company_user_id) {
        continue;
      }

      const employeeName = task.offboarding_request?.employee
        ? `${task.offboarding_request.employee.first_name} ${task.offboarding_request.employee.last_name}`.trim()
        : 'Unknown';

      const assignedUser = task.assigned_to_company_user?.user;
      this.eventEmitter.emit(
        OffboardingTaskOverdueEvent.EVENT,
        new OffboardingTaskOverdueEvent(
          task.offboarding_request.company_id,
          task.offboarding_request_id,
          task.id,
          task.title,
          employeeName,
          task.assigned_to_company_user_id,
          assignedUser
            ? `${assignedUser.first_name ?? ''} ${assignedUser.last_name ?? ''}`.trim() ||
                assignedUser.email
            : null,
          assignedUser?.email ?? null,
          task.due_date!,
          task.offboarding_request.last_working_date ?? null,
          `${frontendUrl}/offboarding/${task.offboarding_request_id}/tasks`,
        ),
      );
    }

    this.logger.log(
      `Emitted overdue events for ${overdueTasks.length} offboarding tasks`,
    );
  }

  private async notifyOverdueClearances() {
    const frontendUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      'http://localhost:5173';
    const overdueClearances = await this.clearanceRepository
      .createQueryBuilder('clearance')
      .innerJoin('clearance.offboarding_request', 'req')
      .leftJoinAndSelect('clearance.owner_company_user', 'ownerMembership')
      .leftJoinAndSelect('ownerMembership.user', 'ownerUser')
      .leftJoinAndSelect('clearance.offboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .where('clearance.status = :status', {
        status: OffboardingClearanceStatusEnum.PENDING,
      })
      .andWhere('clearance.due_date IS NOT NULL')
      .andWhere('clearance.due_date < NOW()')
      .andWhere('req.status IN (:...reqStatuses)', {
        reqStatuses: this.getActiveRequestStatuses(),
      })
      .getMany();

    for (const clearance of overdueClearances) {
      if (!clearance.owner_company_user_id) {
        continue;
      }

      const employeeName = clearance.offboarding_request?.employee
        ? `${clearance.offboarding_request.employee.first_name} ${clearance.offboarding_request.employee.last_name}`.trim()
        : 'Unknown';

      const ownerUser = clearance.owner_company_user?.user;
      this.eventEmitter.emit(
        OffboardingClearanceOverdueEvent.EVENT,
        new OffboardingClearanceOverdueEvent(
          clearance.offboarding_request.company_id,
          clearance.offboarding_request_id,
          clearance.id,
          clearance.clearance_type,
          employeeName,
          clearance.owner_company_user_id,
          ownerUser
            ? `${ownerUser.first_name ?? ''} ${ownerUser.last_name ?? ''}`.trim() ||
                ownerUser.email
            : null,
          ownerUser?.email ?? null,
          clearance.due_date!,
          clearance.offboarding_request.last_working_date ?? null,
          `${frontendUrl}/offboarding/${clearance.offboarding_request_id}/clearances`,
        ),
      );
    }

    this.logger.log(
      `Emitted overdue events for ${overdueClearances.length} offboarding clearances`,
    );
  }

  private async notifyStaleApprovals() {
    const reminderDays = this.configService.get<number>(
      'OFFBOARDING_APPROVAL_REMINDER_DAYS',
      2,
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - reminderDays);
    const frontendUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      'http://localhost:5173';

    const staleApprovals = await this.approvalRepository
      .createQueryBuilder('approval')
      .innerJoin('approval.offboarding_request', 'req')
      .leftJoinAndSelect('approval.workflow_step', 'workflowStep')
      .leftJoinAndSelect('approval.approver_company_user', 'approverMembership')
      .leftJoinAndSelect('approverMembership.user', 'approverUser')
      .leftJoinAndSelect('approval.offboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .where('approval.status = :status', {
        status: OffboardingApprovalStatusEnum.PENDING,
      })
      .andWhere('approval.created_at < :cutoff', { cutoff })
      .andWhere('req.status IN (:...reqStatuses)', {
        reqStatuses: this.getActiveRequestStatuses(),
      })
      .getMany();

    for (const approval of staleApprovals) {
      if (!approval.approver_company_user_id) {
        continue;
      }

      const employeeName = approval.offboarding_request?.employee
        ? `${approval.offboarding_request.employee.first_name} ${approval.offboarding_request.employee.last_name}`.trim()
        : 'Unknown';

      const approverUser = approval.approver_company_user?.user;
      this.eventEmitter.emit(
        OffboardingApprovalReminderEvent.EVENT,
        new OffboardingApprovalReminderEvent(
          approval.offboarding_request.company_id,
          approval.offboarding_request_id,
          approval.id,
          approval.workflow_step?.approval_level ?? null,
          employeeName,
          approval.approver_company_user_id,
          approverUser
            ? `${approverUser.first_name ?? ''} ${approverUser.last_name ?? ''}`.trim() ||
                approverUser.email
            : null,
          approverUser?.email ?? null,
          approval.offboarding_request.last_working_date ?? null,
          `${frontendUrl}/offboarding/${approval.offboarding_request_id}/review`,
        ),
      );
    }

    this.logger.log(
      `Emitted reminder events for ${staleApprovals.length} stale offboarding approvals`,
    );
  }
}
