import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  LEAVE_BALANCE_IMPORT_QUEUE,
  LeaveBalanceImportJobData,
  LeaveBalanceImportJobName,
} from './leave-balance-import-job.constants';
import { LeaveBalanceImportService } from './leave-balance-import.service';

@Processor(LEAVE_BALANCE_IMPORT_QUEUE, { lockDuration: 300000 })
export class LeaveBalanceImportProcessor extends WorkerHost {
  private readonly logger = new Logger(LeaveBalanceImportProcessor.name);

  constructor(
    private readonly leaveBalanceImportService: LeaveBalanceImportService,
  ) {
    super();
  }

  async process(job: Job<LeaveBalanceImportJobData>): Promise<void> {
    if (job.name !== String(LeaveBalanceImportJobName.PROCESS_BATCH)) {
      this.logger.warn(
        `Ignoring unsupported leave balance import job ${job.name}`,
      );
      return;
    }

    await this.leaveBalanceImportService.processQueuedBatch(job.data);
  }
}
