import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { OffboardingApprovalStatusEnum } from '../enums/offboarding-approval-status.enum';
import { OffboardingClearanceStatusEnum } from '../enums/offboarding-clearance-status.enum';
import { OffboardingRequestStatusEnum } from '../enums/offboarding-request-status.enum';
import { OffboardingTaskStatusEnum } from '../enums/offboarding-task-status.enum';
import { OffboardingApproval } from '../entities/offboarding-approval.entity';
import { OffboardingClearance } from '../entities/offboarding-clearance.entity';
import { OffboardingTask } from '../entities/offboarding-task.entity';
import { OffboardingAssetReturn } from '../entities/offboarding-asset-return.entity';
import { OffboardingSettlementItem } from '../entities/offboarding-settlement-item.entity';
import { OffboardingAssetStatusEnum } from '../enums/offboarding-asset-status.enum';
import { OffboardingSettlementStatusEnum } from '../enums/offboarding-settlement-status.enum';
import {
  OffboardingApprovalReminderEvent,
  OffboardingAssetOverdueEvent,
  OffboardingClearanceOverdueEvent,
  OffboardingSettlementOverdueEvent,
  OffboardingTaskOverdueEvent,
} from '../../notifications/events';

const OFFBOARDING_REMINDERS_LOCK_KEY = 'offboarding:overdue-reminders';

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
    @InjectRepository(OffboardingAssetReturn)
    private readonly assetReturnRepository: Repository<OffboardingAssetReturn>,
    @InjectRepository(OffboardingSettlementItem)
    private readonly settlementItemRepository: Repository<OffboardingSettlementItem>,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleOffboardingEscalations() {
    const { acquired } = await this.advisoryLockService.runWithLock(
      OFFBOARDING_REMINDERS_LOCK_KEY,
      async () => {
        this.logger.log('Running offboarding SLA and escalation check');
        await Promise.allSettled([
          this.notifyOverdueTasks(),
          this.notifyOverdueClearances(),
          this.notifyStaleApprovals(),
          this.notifyOverdueAssets(),
          this.notifyOverdueSettlements(),
        ]);
      },
    );

    if (!acquired) {
      this.logger.log(
        'Skipped offboarding SLA and escalation check: another worker holds the lock',
      );
    }
  }

  private reminderCutoff(hours: number): Date {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    return cutoff;
  }

  /**
   * Marks a reminder as sent only if it hasn't been sent within the cutoff
   * window, so retried or overlapping cron runs never double-notify.
   */
  private async claimReminder<
    T extends {
      id: number;
      last_reminder_at: Date | null;
      reminder_count: number;
    },
  >(repository: Repository<T>, id: number, cutoff: Date): Promise<boolean> {
    const updateValues: QueryDeepPartialEntity<T> = {
      last_reminder_at: new Date(),
      reminder_count: () => '"reminder_count" + 1',
    };
    const result = await repository
      .createQueryBuilder()
      .update()
      .set(updateValues)
      .where('id = :id', { id })
      .andWhere('(last_reminder_at IS NULL OR last_reminder_at < :cutoff)', {
        cutoff,
      })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  private getActiveRequestStatuses(): OffboardingRequestStatusEnum[] {
    return [
      OffboardingRequestStatusEnum.PENDING_MANAGER,
      OffboardingRequestStatusEnum.WAITING_APPROVAL,
      OffboardingRequestStatusEnum.IN_PROGRESS,
    ];
  }

  private async notifyOverdueTasks() {
    const frontendUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      'http://localhost:5173';
    const reminderCutoff = this.reminderCutoff(
      this.configService.get<number>('OFFBOARDING_TASK_REMINDER_HOURS', 24),
    );
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

    let notified = 0;
    for (const task of overdueTasks) {
      if (!task.assigned_to_company_user_id) {
        continue;
      }

      if (
        !(await this.claimReminder(
          this.taskRepository,
          task.id,
          reminderCutoff,
        ))
      ) {
        continue;
      }
      notified += 1;

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
      `Emitted overdue events for ${notified}/${overdueTasks.length} offboarding tasks`,
    );
  }

  private async notifyOverdueClearances() {
    const frontendUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      'http://localhost:5173';
    const reminderCutoff = this.reminderCutoff(
      this.configService.get<number>(
        'OFFBOARDING_CLEARANCE_REMINDER_HOURS',
        24,
      ),
    );
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

    let notified = 0;
    for (const clearance of overdueClearances) {
      if (!clearance.owner_company_user_id) {
        continue;
      }

      if (
        !(await this.claimReminder(
          this.clearanceRepository,
          clearance.id,
          reminderCutoff,
        ))
      ) {
        continue;
      }
      notified += 1;

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
      `Emitted overdue events for ${notified}/${overdueClearances.length} offboarding clearances`,
    );
  }

  private async notifyStaleApprovals() {
    const reminderDays = this.configService.get<number>(
      'OFFBOARDING_APPROVAL_REMINDER_DAYS',
      2,
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - reminderDays);
    const reminderCutoff = this.reminderCutoff(
      this.configService.get<number>('OFFBOARDING_APPROVAL_REMINDER_HOURS', 24),
    );
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

    let notified = 0;
    for (const approval of staleApprovals) {
      if (!approval.approver_company_user_id) {
        continue;
      }

      if (
        !(await this.claimReminder(
          this.approvalRepository,
          approval.id,
          reminderCutoff,
        ))
      ) {
        continue;
      }
      notified += 1;

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
      `Emitted reminder events for ${notified}/${staleApprovals.length} stale offboarding approvals`,
    );
  }

  private async notifyOverdueAssets() {
    const frontendUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      'http://localhost:5173';
    const reminderCutoff = this.reminderCutoff(
      this.configService.get<number>('OFFBOARDING_ASSET_REMINDER_HOURS', 24),
    );

    const overdueAssets = await this.assetReturnRepository
      .createQueryBuilder('asset')
      .innerJoin('asset.offboarding_request', 'req')
      .leftJoinAndSelect('asset.owner_company_user', 'ownerMembership')
      .leftJoinAndSelect('ownerMembership.user', 'ownerUser')
      .leftJoinAndSelect('asset.offboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .where('asset.status = :status', {
        status: OffboardingAssetStatusEnum.PENDING,
      })
      .andWhere('asset.due_date IS NOT NULL')
      .andWhere('asset.due_date < NOW()')
      .andWhere('req.status IN (:...reqStatuses)', {
        reqStatuses: this.getActiveRequestStatuses(),
      })
      .getMany();

    let notified = 0;
    for (const asset of overdueAssets) {
      if (!asset.owner_company_user_id) {
        continue;
      }

      if (
        !(await this.claimReminder(
          this.assetReturnRepository,
          asset.id,
          reminderCutoff,
        ))
      ) {
        continue;
      }
      notified += 1;

      const employeeName = asset.offboarding_request?.employee
        ? `${asset.offboarding_request.employee.first_name} ${asset.offboarding_request.employee.last_name}`.trim()
        : 'Unknown';

      const ownerUser = asset.owner_company_user?.user;
      this.eventEmitter.emit(
        OffboardingAssetOverdueEvent.EVENT,
        new OffboardingAssetOverdueEvent(
          asset.offboarding_request.company_id,
          asset.offboarding_request_id,
          asset.id,
          asset.asset_label,
          employeeName,
          asset.owner_company_user_id,
          ownerUser
            ? `${ownerUser.first_name ?? ''} ${ownerUser.last_name ?? ''}`.trim() ||
                ownerUser.email
            : null,
          ownerUser?.email ?? null,
          asset.due_date!,
          asset.offboarding_request.last_working_date ?? null,
          `${frontendUrl}/offboarding/${asset.offboarding_request_id}/assets`,
        ),
      );
    }

    this.logger.log(
      `Emitted overdue events for ${notified}/${overdueAssets.length} offboarding asset returns`,
    );
  }

  private async notifyOverdueSettlements() {
    const frontendUrl =
      this.configService.get<string>('APP_FRONTEND_URL') ??
      'http://localhost:5173';
    const reminderCutoff = this.reminderCutoff(
      this.configService.get<number>(
        'OFFBOARDING_SETTLEMENT_REMINDER_HOURS',
        24,
      ),
    );

    const overdueSettlements = await this.settlementItemRepository
      .createQueryBuilder('settlement')
      .innerJoin('settlement.offboarding_request', 'req')
      .leftJoinAndSelect('settlement.owner_company_user', 'ownerMembership')
      .leftJoinAndSelect('ownerMembership.user', 'ownerUser')
      .leftJoinAndSelect('settlement.offboarding_request', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .where('settlement.status IN (:...statuses)', {
        statuses: [
          OffboardingSettlementStatusEnum.PENDING,
          OffboardingSettlementStatusEnum.IN_PROGRESS,
        ],
      })
      .andWhere('settlement.due_date IS NOT NULL')
      .andWhere('settlement.due_date < NOW()')
      .andWhere('req.status IN (:...reqStatuses)', {
        reqStatuses: this.getActiveRequestStatuses(),
      })
      .getMany();

    let notified = 0;
    for (const settlement of overdueSettlements) {
      if (!settlement.owner_company_user_id) {
        continue;
      }

      if (
        !(await this.claimReminder(
          this.settlementItemRepository,
          settlement.id,
          reminderCutoff,
        ))
      ) {
        continue;
      }
      notified += 1;

      const employeeName = settlement.offboarding_request?.employee
        ? `${settlement.offboarding_request.employee.first_name} ${settlement.offboarding_request.employee.last_name}`.trim()
        : 'Unknown';

      const ownerUser = settlement.owner_company_user?.user;
      this.eventEmitter.emit(
        OffboardingSettlementOverdueEvent.EVENT,
        new OffboardingSettlementOverdueEvent(
          settlement.offboarding_request.company_id,
          settlement.offboarding_request_id,
          settlement.id,
          settlement.title,
          employeeName,
          settlement.owner_company_user_id,
          ownerUser
            ? `${ownerUser.first_name ?? ''} ${ownerUser.last_name ?? ''}`.trim() ||
                ownerUser.email
            : null,
          ownerUser?.email ?? null,
          settlement.due_date!,
          settlement.offboarding_request.last_working_date ?? null,
          `${frontendUrl}/offboarding/${settlement.offboarding_request_id}/settlements`,
        ),
      );
    }

    this.logger.log(
      `Emitted overdue events for ${notified}/${overdueSettlements.length} offboarding settlement items`,
    );
  }
}
