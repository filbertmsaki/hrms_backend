import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../common/database/postgres-advisory-lock.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { normalizeTanzaniaPhone } from '../../common/utils/tanzania-phone.util';
import { NotificationsGateway } from './notifications.gateway';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationOutboxEvent } from './entities/notification-outbox-event.entity';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationDeliveryStatusEnum } from './enums/notification-delivery-status.enum';
import { unsupportedNotificationChannelMessage } from './notification-channel-policy';
import { NotificationChannelManagementService } from './notification-channel-management.service';
import { PushNotificationService } from './push-notification.service';

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
    private readonly gateway: NotificationsGateway,
    private readonly notificationChannelManagementService: NotificationChannelManagementService,
    private readonly pushNotificationService: PushNotificationService,
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

  async processOutboxEvent(id: number): Promise<void> {
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

  async deliverOne(deliveryId: number): Promise<void> {
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
    delivery.recipientAddress = this.resolveRecipientAddress(delivery);

    if (
      delivery.channel === NotificationChannelEnum.EMAIL ||
      delivery.channel === NotificationChannelEnum.IN_APP ||
      delivery.channel === NotificationChannelEnum.PUSH
    ) {
      const verdict =
        await this.notificationChannelManagementService.evaluateChannel(
          delivery.channel,
          this.notificationChannelManagementService.resolveDeliveryCode({
            type: delivery.notification?.type ?? null,
            eventKey: delivery.notification?.event_key ?? null,
            templateCode: delivery.notification?.template_code ?? null,
          }),
          {
            module: delivery.notification?.related_module ?? null,
          },
        );

      if (!verdict.enabled) {
        delivery.status = NotificationDeliveryStatusEnum.SKIPPED;
        delivery.lastError =
          verdict.reason ?? 'Notification channel is disabled';
        delivery.nextRetryAt = null;
        await this.deliveryRepository.save(delivery);
        if (
          delivery.notification &&
          delivery.channel === delivery.notification.delivery_channel
        ) {
          await this.notificationRepository.update(delivery.notificationId, {
            delivery_status: delivery.status,
          });
        }
        return;
      }
    }

    try {
      if (delivery.channel === NotificationChannelEnum.EMAIL) {
        const recipientEmail =
          delivery.notification?.receiver_company_user?.user?.email;

        if (!recipientEmail) {
          delivery.status = NotificationDeliveryStatusEnum.FAILED;
          delivery.lastError = 'Recipient has no email address';
        } else {
          const emailSubject =
            this.readNotificationMetadataString(
              delivery.notification,
              'email_subject',
            ) ?? delivery.notification.title;
          const emailBody =
            this.readNotificationMetadataString(
              delivery.notification,
              'email_body',
            ) ?? delivery.notification.message;
          const mailResult =
            await this.mailService.sendGenericNotificationEmail(
              recipientEmail,
              emailSubject,
              emailBody,
              delivery.notification.action_url,
              this.readNotificationMetadataString(
                delivery.notification,
                'action_label',
              ) ?? 'View details',
            );
          delivery.status = NotificationDeliveryStatusEnum.DELIVERED;
          delivery.deliveredAt = new Date();
          delivery.providerMessageId = mailResult.messageId;
          delivery.metadata = {
            ...(delivery.metadata ?? {}),
            provider_response: mailResult.response,
          };
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
          const smsResult = await this.smsService.sendGenericNotificationSms(
            recipientPhone,
            delivery.notification.title,
            delivery.notification.message,
            delivery.notification.action_url,
          );
          delivery.status = NotificationDeliveryStatusEnum.DELIVERED;
          delivery.deliveredAt = new Date();
          delivery.providerMessageId = smsResult.reference;
          delivery.metadata = {
            ...(delivery.metadata ?? {}),
            provider_code: smsResult.providerCode,
            provider_message: smsResult.providerMessage,
          };
          delivery.lastError = null;
        }
      } else if (delivery.channel === NotificationChannelEnum.PUSH) {
        const notification = delivery.notification;
        if (!notification) {
          delivery.status = NotificationDeliveryStatusEnum.FAILED;
          delivery.lastError = 'Notification record is unavailable';
        } else {
          const result = await this.pushNotificationService.sendToNotification(
            notification,
            delivery.id,
          );
          delivery.status = NotificationDeliveryStatusEnum.DELIVERED;
          delivery.deliveredAt = new Date();
          delivery.providerMessageId =
            result.ticketIds.slice(0, 3).join(',') || null;
          delivery.metadata = {
            ...(delivery.metadata ?? {}),
            accepted_devices: result.accepted,
            rejected_devices: result.rejected,
            expo_ticket_ids: result.ticketIds,
            expo_device_tickets: result.deviceTickets,
          };
          delivery.lastError = null;
        }
      } else if (delivery.channel !== NotificationChannelEnum.IN_APP) {
        delivery.status = NotificationDeliveryStatusEnum.SKIPPED;
        delivery.lastError = unsupportedNotificationChannelMessage(
          delivery.channel,
        );
      } else {
        this.gateway.emitToCompanyUser(
          delivery.notification.receiver_company_user_id,
          {
            id: delivery.notification.id,
            company_id: delivery.notification.company_id,
            sender_company_user_id:
              delivery.notification.sender_company_user_id,
            sender_name: null,
            sender_email: null,
            receiver_company_user_id:
              delivery.notification.receiver_company_user_id,
            receiver_name: null,
            receiver_email:
              delivery.notification.receiver_company_user?.user?.email ?? null,
            type: delivery.notification.type,
            category: delivery.notification.category,
            priority: delivery.notification.priority,
            title: delivery.notification.title,
            message: delivery.notification.message,
            related_module: delivery.notification.related_module,
            entity_type: delivery.notification.entity_type,
            entity_id: delivery.notification.entity_id,
            branch_id: delivery.notification.branch_id,
            department_id: delivery.notification.department_id,
            action_url: delivery.notification.action_url,
            metadata: delivery.notification.metadata,
            status: delivery.notification.status,
            seen_at: delivery.notification.seen_at,
            read_at: delivery.notification.read_at,
            delivery_channel: delivery.notification.delivery_channel,
            delivery_status: NotificationDeliveryStatusEnum.DELIVERED,
            dedupe_key: delivery.notification.dedupe_key,
            expires_at: delivery.notification.expires_at,
            archived_at: delivery.notification.archived_at,
            is_read: false,
            is_seen: false,
            is_archived: false,
            created_at: delivery.notification.created_at,
            updated_at: delivery.notification.updated_at,
          },
        );
        const unreadCount = await this.notificationRepository.count({
          where: {
            company_id: delivery.notification.company_id,
            receiver_company_user_id:
              delivery.notification.receiver_company_user_id,
            status: 'UNREAD' as never,
          },
        });
        this.gateway.emitUnreadCount(
          delivery.notification.receiver_company_user_id,
          unreadCount,
        );
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

    if (
      delivery.notification &&
      delivery.channel === delivery.notification.delivery_channel
    ) {
      await this.notificationRepository.update(delivery.notificationId, {
        delivery_status: delivery.status,
      });
    }
  }

  private resolveRecipientAddress(
    delivery: NotificationDelivery,
  ): string | null {
    if (delivery.channel === NotificationChannelEnum.EMAIL) {
      return (
        delivery.notification?.receiver_company_user?.user?.email
          ?.trim()
          .toLowerCase() ??
        delivery.recipientAddress ??
        null
      );
    }

    if (delivery.channel === NotificationChannelEnum.SMS) {
      return (
        normalizeTanzaniaPhone(
          delivery.notification?.receiver_company_user?.user?.phone ?? null,
        ) ??
        delivery.recipientAddress ??
        null
      );
    }

    if (delivery.channel === NotificationChannelEnum.IN_APP) {
      if (
        typeof delivery.recipientAddress === 'string' &&
        delivery.recipientAddress.startsWith('company-user:')
      ) {
        return delivery.recipientAddress;
      }

      return `company-user:${delivery.notification?.receiver_company_user_id ?? 'unknown'}`;
    }

    return delivery.recipientAddress ?? null;
  }

  private readNotificationMetadataString(
    notification: AppNotification | null | undefined,
    key: string,
  ): string | null {
    const value = notification?.metadata?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
