import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  EMPLOYEE_IMPORT_QUEUE,
  EmployeeImportJobData,
  EmployeeImportJobName,
} from './employee-import-job.constants';
import { EmployeeImportService } from './employee-import.service';

@Processor(EMPLOYEE_IMPORT_QUEUE, { lockDuration: 300000 })
export class EmployeeImportProcessor extends WorkerHost {
  private readonly logger = new Logger(EmployeeImportProcessor.name);

  constructor(private readonly employeeImportService: EmployeeImportService) {
    super();
  }

  async process(job: Job<EmployeeImportJobData>): Promise<void> {
    if (job.name !== EmployeeImportJobName.PROCESS_BATCH) {
      this.logger.warn(`Ignoring unsupported employee import job ${job.name}`);
      return;
    }

    await this.employeeImportService.processQueuedBatch(
      job.data,
      String(job.id),
    );
  }
}
