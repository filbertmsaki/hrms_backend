import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { LeaveService } from '../leave.service';

/**
 * Daily: approves pending requests whose leave type opts into
 * auto_approve_after_days (off by default) once that many days have passed
 * since the request was applied. Runs before the 08:00 reminder job.
 */
@Injectable()
export class LeaveAutoApprovalService {
  private readonly logger = new Logger(LeaveAutoApprovalService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly leaveService: LeaveService,
  ) {}

  @Cron('30 7 * * *')
  async runDaily(): Promise<void> {
    try {
      const result = await this.processPending();
      this.logger.log(
        `Leave auto-approval: ${result.approved} of ${result.checked} approved`,
      );
    } catch (error) {
      this.logger.error(
        'Leave auto-approval run failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async processPending(now: Date = new Date()) {
    const rows: Array<{ id: number }> = await this.dataSource
      .getRepository(LeaveRequest)
      .createQueryBuilder('r')
      .innerJoin('r.leave_type', 't')
      .select('r.id', 'id')
      .where('r.status IN (:...statuses)', {
        statuses: [
          LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
          LeaveStatusEnum.PENDING_HR,
          LeaveStatusEnum.IN_REVIEW,
        ],
      })
      .andWhere('r.routing_required = false')
      .andWhere('t.auto_approve_after_days IS NOT NULL')
      .andWhere(
        "COALESCE(r.applied_at, r.created_at) <= CAST(:now AS timestamp) - make_interval(days => t.auto_approve_after_days)",
        { now },
      )
      .getRawMany();
    let approved = 0;
    for (const { id } of rows) {
      try {
        if (await this.leaveService.autoApproveOverdueRequest(Number(id), now))
          approved += 1;
      } catch (error) {
        this.logger.error(
          `Auto-approval failed for leave request ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return { checked: rows.length, approved };
  }
}
