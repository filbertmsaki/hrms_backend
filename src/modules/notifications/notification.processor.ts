import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  NOTIFICATION_QUEUE,
  type NotificationJobData,
} from './notification-job.constants';
import { NotificationQueuedTaskRunnerService } from './notification-queued-task-runner.service';

@Processor(NOTIFICATION_QUEUE, { lockDuration: 300000 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly runner: NotificationQueuedTaskRunnerService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.debug(`Processing notification job ${job.name} (${job.id})`);
    await this.runner.handle(job.name, job.data);
  }
}
