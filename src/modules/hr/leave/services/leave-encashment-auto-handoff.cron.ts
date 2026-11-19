import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PostgresAdvisoryLockService } from '../../../../common/database/postgres-advisory-lock.service';
import { LeaveService } from '../leave.service';

/**
 * Retries the automatic payroll handoff of approved year-end encashments
 * (e.g. after Finance confirms the component or a payroll period opens).
 */
@Injectable()
export class LeaveEncashmentAutoHandoffCron {
  private readonly logger = new Logger(LeaveEncashmentAutoHandoffCron.name);

  constructor(
    private readonly leaveService: LeaveService,
    private readonly locks: PostgresAdvisoryLockService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async run(): Promise<void> {
    const outcome = await this.locks.runWithLock(
      'leave-encashment-auto-handoff',
      () => this.leaveService.retryPendingAutoHandOffs(),
    );
    if (
      outcome.acquired &&
      outcome.result &&
      outcome.result.handed_off + outcome.result.failed > 0
    )
      this.logger.log(
        `year-end encashment handoff: ${outcome.result.handed_off} sent, ${outcome.result.failed} still failing`,
      );
  }
}
