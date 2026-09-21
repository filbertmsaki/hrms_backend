import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { Employee } from '../../employees/entities/employee.entity';
import { ActionItemsService } from '../../action-inbox/action-items.service';
import { ActionItemTypeEnum } from '../../action-inbox/enums/action-item-type.enum';
import { formatDateOnly } from '../../shared/hr.utils';
import { EmployeeMovement } from '../entities/employee-movement.entity';
import { EmployeeMovementStatusEnum } from '../enums/employee-movement-status.enum';
import { EmployeeMovementsService } from '../employee-movements.service';

const EMPLOYEE_MOVEMENTS_SCHEDULER_LOCK_KEY = 'employee-movements:scheduler';

@Injectable()
export class EmployeeMovementSchedulerService {
  private readonly logger = new Logger(EmployeeMovementSchedulerService.name);

  constructor(
    @InjectRepository(EmployeeMovement)
    private readonly movementRepository: Repository<EmployeeMovement>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly configService: ConfigService,
    private readonly actionItemsService: ActionItemsService,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
    private readonly employeeMovementsService: EmployeeMovementsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async run(): Promise<void> {
    const { acquired } = await this.advisoryLockService.runWithLock(
      EMPLOYEE_MOVEMENTS_SCHEDULER_LOCK_KEY,
      async () => {
        this.logger.log(
          'Running employee movement auto-apply and approval reminder check',
        );
        await this.autoApplyDueMovements();
        await this.sendApprovalReminders();
      },
    );

    if (!acquired) {
      this.logger.log(
        'Skipped employee movement scheduler run: another worker holds the lock',
      );
    }
  }

  private async autoApplyDueMovements(): Promise<void> {
    const today = formatDateOnly(new Date());

    const movements = await this.movementRepository
      .createQueryBuilder('movement')
      .where('movement.status = :status', {
        status: EmployeeMovementStatusEnum.SCHEDULED,
      })
      .andWhere('movement.effective_date <= :today', { today })
      .getMany();

    for (const movement of movements) {
      try {
        await this.employeeMovementsService.applyScheduled(
          movement.companyId,
          movement.id,
        );
      } catch (error) {
        this.logger.error(
          `Failed to auto-apply employee movement ${movement.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  private getApprovalReminderDays(): number {
    return (
      this.configService.get<number>('MOVEMENT_APPROVAL_REMINDER_DAYS') ?? 3
    );
  }

  private async sendApprovalReminders(): Promise<void> {
    const reminderDays = this.getApprovalReminderDays();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - reminderDays);
    const today = formatDateOnly(new Date());

    const movements = await this.movementRepository
      .createQueryBuilder('movement')
      .innerJoinAndSelect('movement.employee', 'employee')
      .where('movement.status = :status', {
        status: EmployeeMovementStatusEnum.PENDING_APPROVAL,
      })
      .andWhere('movement.submitted_at <= :cutoff', { cutoff })
      .getMany();

    for (const movement of movements) {
      try {
        await this.sendApprovalReminderFor(movement, today);
      } catch (error) {
        this.logger.error(
          `Failed to send approval reminder for employee movement ${movement.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  private async sendApprovalReminderFor(
    movement: EmployeeMovement,
    today: string,
  ): Promise<void> {
    if (!movement.employee?.reports_to) {
      return;
    }

    const managerEmployee = await this.employeeRepository.findOne({
      where: { id: movement.employee.reports_to },
    });

    if (!managerEmployee?.company_user_id) {
      return;
    }

    await this.actionItemsService.upsertOpen({
      companyId: movement.companyId,
      assigneeCompanyUserId: managerEmployee.company_user_id,
      assigneeEmployeeId: managerEmployee.id,
      actionType: ActionItemTypeEnum.REMINDER,
      sourceModule: 'employee_movements',
      sourceEntityType: 'EMPLOYEE_MOVEMENT',
      sourceEntityId: movement.id,
      sourceKey: `employee_movements:approval-reminder:${movement.id}:${today}`,
      title: `Employee movement ${movement.movementNo} awaiting your approval`,
      actionUrl: `/employee-movements/${movement.id}`,
    });
  }
}
