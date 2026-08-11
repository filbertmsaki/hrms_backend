import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { Repository } from 'typeorm';
import {
  NOTIFICATION_QUEUE,
  NotificationJobName,
  type NotificationJobData,
} from './notification-job.constants';
import { NotificationQueuedTaskRunnerService } from './notification-queued-task-runner.service';
import type { SendConfiguredSmsInput } from '../sms/sms-notification-management.service';
import { NotificationMailLog } from './entities/notification-mail-log.entity';
import { NotificationMailLogStatusEnum } from './enums/notification-mail-log-status.enum';

@Injectable()
export class NotificationQueueService {
  private readonly logger = new Logger(NotificationQueueService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly queue: Queue<NotificationJobData>,
    @InjectRepository(NotificationMailLog)
    private readonly mailLogRepository: Repository<NotificationMailLog>,
    private readonly runner: NotificationQueuedTaskRunnerService,
  ) {}

  async enqueueOutboxEvent(outboxEventId: number): Promise<void> {
    await this.publish(
      NotificationJobName.PROCESS_OUTBOX_EVENT,
      { outboxEventId },
      {
        jobId: `notification-outbox:${outboxEventId}`,
        attempts: 3,
        removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
      },
    );
  }

  async enqueueMailMethod(
    method: string,
    args: unknown[],
    options?: { retryOfMailLogId?: number | null; companyId?: number | null },
  ): Promise<void> {
    const mailLog = await this.mailLogRepository.save(
      this.mailLogRepository.create({
        companyId: options?.companyId ?? this.extractCompanyId(args),
        method,
        recipientEmail: this.extractRecipientEmail(args),
        args,
        status: NotificationMailLogStatusEnum.PENDING,
        retryOfLogId: options?.retryOfMailLogId ?? null,
      }),
    );

    await this.publish(
      NotificationJobName.SEND_MAIL_METHOD,
      { method, args, mailLogId: mailLog.id },
      {
        attempts: 3,
        removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
      },
    );
  }

  async enqueueSmsConfiguredNotification(
    input: SendConfiguredSmsInput,
  ): Promise<void> {
    await this.publish(
      NotificationJobName.SEND_SMS_NOTIFICATION,
      { input },
      {
        attempts: 3,
        removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
      },
    );
  }

  private async publish(
    name: NotificationJobName,
    data: NotificationJobData,
    options: JobsOptions,
  ): Promise<void> {
    try {
      await this.queue.add(name, data, options);
    } catch (error) {
      this.logger.warn(
        `Notification queue unavailable for ${name}; falling back to local background execution: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      setImmediate(() => {
        void this.runner.handle(name, data).catch((runnerError) => {
          this.logger.error(
            `Local fallback notification job ${name} failed: ${
              runnerError instanceof Error
                ? runnerError.message
                : String(runnerError)
            }`,
            runnerError instanceof Error ? runnerError.stack : undefined,
          );
        });
      });
    }
  }

  private extractCompanyId(args: unknown[]): number | null {
    for (const arg of args) {
      const fromArg = this.readNumericProperty(arg, [
        'companyId',
        'company_id',
      ]);
      if (fromArg !== null) {
        return fromArg;
      }
    }

    return null;
  }

  private extractRecipientEmail(args: unknown[]): string | null {
    for (const arg of args) {
      if (typeof arg === 'string' && arg.includes('@')) {
        return arg.trim().toLowerCase();
      }

      if (typeof arg === 'object' && arg !== null) {
        const candidate = (arg as Record<string, unknown>).email;
        if (typeof candidate === 'string' && candidate.includes('@')) {
          return candidate.trim().toLowerCase();
        }
      }
    }

    return null;
  }

  private readNumericProperty(value: unknown, keys: string[]): number | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    for (const key of keys) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}
