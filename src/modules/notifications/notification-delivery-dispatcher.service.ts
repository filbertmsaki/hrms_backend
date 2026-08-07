import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../common/database/postgres-advisory-lock.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationOutboxEvent } from './entities/notification-outbox-event.entity';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationDeliveryStatusEnum } from './enums/notification-delivery-status.enum';
import { unsupportedNotificationChannelMessage } from './notification-channel-policy';

export const NOTIFICATION_OUTBOX_DISPATCH_LOCK_KEY =
  'notifications:outbox-dispatch';

@Injectable()
export class NotificationDeliveryDispatcherService {
  private readonly logger = new Logger(
    NotificationDeliveryDispatcherService.name,
  );

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(NotificationOutboxEvent)
    private readonly outboxRepository: Repository<NotificationOutboxEvent>,
    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepository: Repository<NotificationDelivery>,
    @InjectRepository(AppNotification)
    private readonly notificationRepository: Repository<AppNotification>,
    private readonly advisoryLockService: PostgresAdvisoryLockService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
  ) {}

  @Interval(10000)
  async dispatch(): Promise<void> {
    await this.advisoryLockService.runWithLock(
      NOTIFICATION_OUTBOX_DISPATCH_LOCK_KEY,
      async () => this.processDue(),
    );
  }

  private async processDue(): Promise<void> {
    const candidates = await this.outboxRepository.find({
      where: { status: 'PENDING' },
      order: { id: 'ASC' },
      take: 20,
    });

    for (const candidate of candidates) {
      await this.processOutboxEvent(candidate.id);
    }

    const retryable = await this.deliveryRepository.find({
      where: {
        status: NotificationDeliveryStatusEnum.FAILED,
        nextRetryAt: LessThanOrEqual(new Date()),
      },
      order: { id: 'ASC' },
      take: 20,
    });

    for (const delivery of retryable) {
      await this.deliverOne(delivery.id);
    }
  }

  private async processOutboxEvent(id: number): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(NotificationOutboxEvent);
        const event = await repository
          .createQueryBuilder('event')
          .setLock('pessimistic_write')
          .where('event.id = :id', { id })
          .getOne();

        if (!event || event.status !== 'PENDING') {
          return;
        }

        event.status = 'PROCESSING';
        await repository.save(event);
      });

      const deliveries = await this.deliveryRepository.find({
        where: {
          notificationId: (
            await this.outboxRepository.findOneOrFail({ where: { id } })
          ).notificationId,
          status: NotificationDeliveryStatusEnum.PENDING,
        },
      });

      for (const delivery of deliveries) {
        await this.deliverOne(delivery.id);
      }

      await this.outboxRepository.update(id, {
        status: 'PROCESSED',
        processedAt: new Date(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to process notification outbox event ${id}: ${(error as Error).message}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.outboxRepository
        .createQueryBuilder()
        .update(NotificationOutboxEvent)
        .set({
          attemptCount: () => '"attempt_count" + 1',
          status: 'FAILED',
          lastError:
            error instanceof Error ? error.message : 'Outbox processing failed',
        } as never)
        .where('id = :id', { id })
        .execute();
    }
  }

  private async deliverOne(deliveryId: number): Promise<void> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
      relations: {
        notification: {
          receiver_company_user: { user: true },
        },
      },
    });

    if (!delivery) {
      return;
    }

    delivery.attemptCount += 1;
    delivery.lastAttemptAt = new Date();

    try {
      if (delivery.channel === NotificationChannelEnum.EMAIL) {
        const recipientEmail =
          delivery.notification?.receiver_company_user?.user?.email;

        if (!recipientEmail) {
          delivery.status = NotificationDeliveryStatusEnum.FAILED;
          delivery.lastError = 'Recipient has no email address';
        } else {
          await this.mailService.sendGenericNotificationEmail(
            recipientEmail,
            delivery.notification.title,
            delivery.notification.message,
            delivery.notification.action_url,
          );
          delivery.status = NotificationDeliveryStatusEnum.DELIVERED;
          delivery.deliveredAt = new Date();
          delivery.lastError = null;
        }
      } else if (delivery.channel === NotificationChannelEnum.SMS) {
        const recipientPhone =
          delivery.notification?.receiver_company_user?.user?.phone;

        if (!recipientPhone) {
          delivery.status = NotificationDeliveryStatusEnum.FAILED;
          delivery.lastError = 'Recipient has no phone number';
        } else if (!this.smsService.isConfigured()) {
          delivery.status = NotificationDeliveryStatusEnum.SKIPPED;
          delivery.lastError =
            this.smsService.getConfigurationError() ??
            'SMS gateway is not configured';
        } else {
          await this.smsService.sendGenericNotificationSms(
            recipientPhone,
            delivery.notification.title,
            delivery.notification.message,
            delivery.notification.action_url,
          );
          delivery.status = NotificationDeliveryStatusEnum.DELIVERED;
          delivery.deliveredAt = new Date();
          delivery.lastError = null;
        }
      } else if (delivery.channel !== NotificationChannelEnum.IN_APP) {
        delivery.status = NotificationDeliveryStatusEnum.SKIPPED;
        delivery.lastError = unsupportedNotificationChannelMessage(
          delivery.channel,
        );
      } else {
        delivery.status = NotificationDeliveryStatusEnum.DELIVERED;
        delivery.deliveredAt = new Date();
      }
    } catch (error) {
      delivery.status = NotificationDeliveryStatusEnum.FAILED;
      delivery.lastError =
        error instanceof Error ? error.message : 'Delivery failed';
      delivery.nextRetryAt = new Date(Date.now() + 5 * 60 * 1000);
    }

    await this.deliveryRepository.save(delivery);
  }
}
