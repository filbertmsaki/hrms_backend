import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { NotificationChannelManagementService } from './notification-channel-management.service';
import { SmsNotificationManagementService } from '../sms/sms-notification-management.service';
import {
  NotificationJobName,
  type NotificationMailJobData,
  type NotificationOutboxJobData,
  type NotificationSmsJobData,
} from './notification-job.constants';
import { NotificationDeliveryDispatcherService } from './notification-delivery-dispatcher.service';
import { NotificationMailLog } from './entities/notification-mail-log.entity';
import { NotificationMailLogStatusEnum } from './enums/notification-mail-log-status.enum';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { ALLOWED_NOTIFICATION_MAIL_METHODS } from './notification-mail-method.constants';

@Injectable()
export class NotificationQueuedTaskRunnerService {
  private readonly logger = new Logger(NotificationQueuedTaskRunnerService.name);

  constructor(
    private readonly dispatcher: NotificationDeliveryDispatcherService,
    private readonly mailService: MailService,
    private readonly notificationChannelManagementService: NotificationChannelManagementService,
    private readonly smsNotificationManagementService: SmsNotificationManagementService,
    @InjectRepository(NotificationMailLog)
    private readonly mailLogRepository: Repository<NotificationMailLog>,
  ) {}

  async handle(jobName: string, data: unknown): Promise<void> {
    switch (jobName) {
      case NotificationJobName.PROCESS_OUTBOX_EVENT:
        await this.dispatcher.processOutboxEvent(
          (data as NotificationOutboxJobData).outboxEventId,
        );
        return;
      case NotificationJobName.SEND_MAIL_METHOD:
        await this.invokeMailMethod(data as NotificationMailJobData);
        return;
      case NotificationJobName.SEND_SMS_NOTIFICATION:
        await this.smsNotificationManagementService.sendConfiguredNotification(
          (data as NotificationSmsJobData).input,
        );
        return;
      default:
        this.logger.warn(`Ignoring unsupported notification job ${jobName}`);
    }
  }

  private async invokeMailMethod(data: NotificationMailJobData): Promise<void> {
    const mailLog = data.mailLogId
      ? await this.mailLogRepository.findOne({ where: { id: data.mailLogId } })
      : null;

    if (!ALLOWED_NOTIFICATION_MAIL_METHODS.has(data.method)) {
      const error = new Error(
        `Mail method ${data.method} is not allowed for queued execution`,
      );
      await this.markMailLogFailed(mailLog, error);
      throw error;
    }

    const method = (this.mailService as unknown as Record<string, unknown>)[
      data.method
    ];
    if (typeof method !== 'function') {
      const error = new Error(`Mail method ${data.method} does not exist`);
      await this.markMailLogFailed(mailLog, error);
      throw error;
    }

    const verdict = await this.notificationChannelManagementService.evaluateChannel(
      NotificationChannelEnum.EMAIL,
      data.method,
    );
    if (!verdict.enabled) {
      if (mailLog) {
        mailLog.status = NotificationMailLogStatusEnum.SKIPPED;
        mailLog.processedAt = new Date();
        mailLog.errorMessage = verdict.reason ?? 'Email notifications are disabled';
        mailLog.providerMessageId = null;
        mailLog.providerResponse = null;
        await this.mailLogRepository.save(mailLog);
      }
      return;
    }

    try {
      const result = await (method as (...args: unknown[]) => Promise<unknown>).apply(
        this.mailService,
        data.args,
      );

      if (mailLog) {
        mailLog.status = NotificationMailLogStatusEnum.SENT;
        mailLog.processedAt = new Date();
        mailLog.errorMessage = null;
        if (this.isMailSendResult(result)) {
          mailLog.providerMessageId = result.messageId ?? null;
          mailLog.providerResponse = result.response ?? null;
        }
        await this.mailLogRepository.save(mailLog);
      }
    } catch (error) {
      await this.markMailLogFailed(mailLog, error);
      throw error;
    }
  }

  private async markMailLogFailed(
    mailLog: NotificationMailLog | null,
    error: unknown,
  ): Promise<void> {
    if (!mailLog) {
      return;
    }

    mailLog.status = NotificationMailLogStatusEnum.FAILED;
    mailLog.processedAt = new Date();
    mailLog.errorMessage =
      error instanceof Error ? error.message : String(error);
    await this.mailLogRepository.save(mailLog);
  }

  private isMailSendResult(
    value: unknown,
  ): value is { messageId?: string | null; response?: string | null } {
    return typeof value === 'object' && value !== null;
  }
}
