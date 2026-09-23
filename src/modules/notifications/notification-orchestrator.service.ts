import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { normalizeTanzaniaPhone } from '../../common/utils/tanzania-phone.util';
import { NotificationCategoryEnum } from './enums/notification-category.enum';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationDeliveryStatusEnum } from './enums/notification-delivery-status.enum';
import { NotificationPriorityEnum } from './enums/notification-priority.enum';
import { NotificationStatusEnum } from './enums/notification-status.enum';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationOutboxEvent } from './entities/notification-outbox-event.entity';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationPreferencesService } from './notification-preferences.service';
import {
  partitionNotificationChannels,
  unsupportedNotificationChannelMessage,
} from './notification-channel-policy';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationChannelManagementService } from './notification-channel-management.service';
import { NotificationConfigurationService } from './notification-configuration.service';

export type CreateNotificationInput = {
  company_id: number;
  sender_company_user_id?: number | null;
  receiver_company_user_id: number;
  type?: NotificationTypeEnum | string;
  category?: NotificationCategoryEnum;
  priority?: NotificationPriorityEnum;
  title: string;
  message: string;
  related_module?: string | null;
  entity_type?: string | null;
  entity_id?: string | number | null;
  branch_id?: number | null;
  department_id?: number | null;
  action_url?: string | null;
  metadata?: Record<string, unknown> | null;
  delivery_channel?: NotificationChannelEnum;
  delivery_status?: NotificationDeliveryStatusEnum;
  dedupe_key?: string | null;
  expires_at?: Date | null;
  event_key?: string | null;
  template_code?: string | null;
  is_mandatory?: boolean;
  payload?: Record<string, unknown> | null;
  channels?: NotificationChannelEnum[];
};

@Injectable()
export class NotificationOrchestratorService {
  private readonly logger = new Logger(NotificationOrchestratorService.name);

  constructor(
    @InjectRepository(AppNotification)
    private readonly notificationRepository: Repository<AppNotification>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepository: Repository<NotificationDelivery>,
    @InjectRepository(NotificationOutboxEvent)
    private readonly outboxRepository: Repository<NotificationOutboxEvent>,
    private readonly gateway: NotificationsGateway,
    private readonly preferencesService: NotificationPreferencesService,
    private readonly notificationChannelManagementService: NotificationChannelManagementService,
    private readonly notificationQueueService: NotificationQueueService,
    private readonly notificationConfigurationService: NotificationConfigurationService,
  ) {}

  async create(input: CreateNotificationInput) {
    const receiver = await this.companyUserRepository.findOne({
      where: {
        id: input.receiver_company_user_id,
        company_id: input.company_id,
      },
      relations: {
        user: true,
      },
    });

    if (!receiver) {
      throw new NotFoundException('Notification receiver not found');
    }

    const dedupeKey = input.dedupe_key?.trim() || null;

    if (dedupeKey) {
      const existing = await this.notificationRepository.findOne({
        where: {
          company_id: input.company_id,
          receiver_company_user_id: input.receiver_company_user_id,
          dedupe_key: dedupeKey,
          archived_at: IsNull(),
        },
        relations: {
          sender_company_user: { user: true },
          receiver_company_user: { user: true },
        },
      });

      if (existing) {
        return this.mapNotification(existing);
      }
    }

    const type = (input.type ??
      NotificationTypeEnum.GENERAL) as NotificationTypeEnum;
    const payload = input.payload ?? input.metadata ?? {};
    const renderedTemplate = input.template_code
      ? await this.notificationConfigurationService.renderTemplate(
          input.company_id,
          input.template_code,
          payload,
        )
      : null;
    const requestedChannels = input.channels?.length
      ? input.channels
      : [input.delivery_channel ?? NotificationChannelEnum.IN_APP];
    const { supported: supportedRequestedChannels, unsupported } =
      partitionNotificationChannels(requestedChannels);

    const {
      enabledChannels: systemEnabledChannels,
      disabledChannels: systemDisabledChannels,
    } = await this.notificationChannelManagementService.resolveEnabledChannels({
      channels: supportedRequestedChannels,
      notificationType: type,
      eventKey: input.event_key ?? null,
      templateCode: input.template_code ?? null,
      relatedModule: input.related_module ?? null,
    });

    const allowedChannels = input.is_mandatory
      ? systemEnabledChannels
      : await this.preferencesService.filterEnabledChannels(
          receiver.id,
          type,
          systemEnabledChannels,
        );

    let created: AppNotification;

    try {
      created = await this.notificationRepository.save(
        this.notificationRepository.create({
          company_id: input.company_id,
          sender_company_user_id: input.sender_company_user_id ?? null,
          receiver_company_user_id: input.receiver_company_user_id,
          type,
          category: input.category ?? NotificationCategoryEnum.GENERAL,
          priority: input.priority ?? NotificationPriorityEnum.MEDIUM,
          title: renderedTemplate?.title ?? input.title,
          message: renderedTemplate?.systemMessage ?? input.message,
          related_module: input.related_module ?? null,
          entity_type: input.entity_type ?? null,
          entity_id:
            input.entity_id === undefined || input.entity_id === null
              ? null
              : String(input.entity_id),
          branch_id: input.branch_id ?? null,
          department_id: input.department_id ?? null,
          action_url: input.action_url ?? null,
          metadata: {
            ...(input.metadata ?? {}),
            ...(renderedTemplate?.emailSubject
              ? { email_subject: renderedTemplate.emailSubject }
              : {}),
            ...(renderedTemplate?.emailBody
              ? { email_body: renderedTemplate.emailBody }
              : {}),
            ...(renderedTemplate?.mobileMessage
              ? { mobile_message: renderedTemplate.mobileMessage }
              : {}),
          },
          status: NotificationStatusEnum.UNREAD,
          seen_at: null,
          read_at: null,
          delivery_channel:
            requestedChannels[0] ?? NotificationChannelEnum.IN_APP,
          delivery_status:
            input.delivery_status ?? NotificationDeliveryStatusEnum.PENDING,
          dedupe_key: dedupeKey,
          expires_at: input.expires_at ?? null,
          archived_at: null,
          event_key: input.event_key ?? null,
          template_code: input.template_code ?? null,
          is_mandatory: input.is_mandatory ?? false,
          payload: input.payload ?? null,
        }),
      );
    } catch (error) {
      if (dedupeKey && this.isUniqueViolation(error)) {
        const existing = await this.notificationRepository.findOneOrFail({
          where: {
            company_id: input.company_id,
            receiver_company_user_id: input.receiver_company_user_id,
            dedupe_key: dedupeKey,
          },
          relations: {
            sender_company_user: { user: true },
            receiver_company_user: { user: true },
          },
        });
        return this.mapNotification(existing);
      }
      throw error;
    }

    await this.createDeliveryRows(created.id, allowedChannels, receiver);

    for (const { channel, reason } of systemDisabledChannels) {
      await this.deliveryRepository.save(
        this.deliveryRepository.create({
          notificationId: created.id,
          channel,
          recipientAddress: this.resolveRecipientAddress(channel, receiver),
          status: NotificationDeliveryStatusEnum.SKIPPED,
          lastError: `Skipped: ${reason}`,
        }),
      );
    }

    for (const channel of systemEnabledChannels.filter(
      (c) => !allowedChannels.includes(c),
    )) {
      await this.deliveryRepository.save(
        this.deliveryRepository.create({
          notificationId: created.id,
          channel,
          recipientAddress: this.resolveRecipientAddress(channel, receiver),
          status: NotificationDeliveryStatusEnum.SKIPPED,
          lastError: 'Skipped: disabled by recipient notification preferences',
        }),
      );
    }

    for (const channel of unsupported) {
      await this.deliveryRepository.save(
        this.deliveryRepository.create({
          notificationId: created.id,
          channel,
          recipientAddress: this.resolveRecipientAddress(channel, receiver),
          status: NotificationDeliveryStatusEnum.SKIPPED,
          lastError: unsupportedNotificationChannelMessage(channel),
        }),
      );
    }

    const outboxEvent = await this.outboxRepository.save(
      this.outboxRepository.create({ notificationId: created.id }),
    );
    void this.notificationQueueService.enqueueOutboxEvent(outboxEvent.id);

    const notification = await this.findOneForResponse(created.id);
    return this.mapNotification(notification);
  }

  private async createDeliveryRows(
    notificationId: number,
    channels: NotificationChannelEnum[],
    receiver: CompanyUser,
  ) {
    for (const channel of channels) {
      await this.deliveryRepository.save(
        this.deliveryRepository.create({
          notificationId,
          channel,
          recipientAddress: this.resolveRecipientAddress(channel, receiver),
          status: NotificationDeliveryStatusEnum.PENDING,
          deliveredAt: null,
        }),
      );
    }
  }

  private resolveRecipientAddress(
    channel: NotificationChannelEnum,
    receiver: CompanyUser,
  ): string | null {
    if (channel === NotificationChannelEnum.EMAIL) {
      return receiver.user?.email?.trim().toLowerCase() ?? null;
    }

    if (channel === NotificationChannelEnum.SMS) {
      return normalizeTanzaniaPhone(receiver.user?.phone ?? null);
    }

    if (channel === NotificationChannelEnum.IN_APP) {
      return `company-user:${receiver.id}`;
    }

    return null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505'
    );
  }

  private async findOneForResponse(id: number): Promise<AppNotification> {
    return this.notificationRepository.findOneOrFail({
      where: { id },
      relations: {
        sender_company_user: { user: true },
        receiver_company_user: { user: true },
      },
    });
  }

  mapNotification(notification: AppNotification) {
    const senderUser = notification.sender_company_user?.user;
    const receiverUser = notification.receiver_company_user?.user;

    const senderName = senderUser
      ? `${senderUser.first_name ?? ''} ${senderUser.last_name ?? ''}`.trim() ||
        senderUser.email
      : null;

    const receiverName = receiverUser
      ? `${receiverUser.first_name ?? ''} ${receiverUser.last_name ?? ''}`.trim() ||
        receiverUser.email
      : null;

    return {
      id: notification.id,
      company_id: notification.company_id,
      sender_company_user_id: notification.sender_company_user_id,
      sender_name: senderName,
      sender_email: senderUser?.email ?? null,
      receiver_company_user_id: notification.receiver_company_user_id,
      receiver_name: receiverName,
      receiver_email: receiverUser?.email ?? null,
      type: notification.type,
      category: notification.category,
      priority: notification.priority,
      title: notification.title,
      message: notification.message,
      related_module: notification.related_module,
      entity_type: notification.entity_type,
      entity_id: notification.entity_id,
      branch_id: notification.branch_id,
      department_id: notification.department_id,
      action_url: notification.action_url,
      metadata: notification.metadata,
      status: notification.status,
      seen_at: notification.seen_at,
      read_at: notification.read_at,
      delivery_channel: notification.delivery_channel,
      delivery_status: notification.delivery_status,
      dedupe_key: notification.dedupe_key,
      expires_at: notification.expires_at,
      archived_at: notification.archived_at,
      event_key: notification.event_key,
      template_code: notification.template_code,
      is_mandatory: notification.is_mandatory,
      payload: notification.payload,
      is_read: notification.status === NotificationStatusEnum.READ,
      is_seen: Boolean(notification.seen_at),
      is_archived: Boolean(notification.archived_at),
      created_at: notification.created_at,
      updated_at: notification.updated_at,
    };
  }
}
