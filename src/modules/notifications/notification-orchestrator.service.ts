import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';
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
  ) {}

  async create(input: CreateNotificationInput) {
    const receiver = await this.companyUserRepository.findOne({
      where: {
        id: input.receiver_company_user_id,
        company_id: input.company_id,
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
    const requestedChannels = input.channels?.length
      ? input.channels
      : [input.delivery_channel ?? NotificationChannelEnum.IN_APP];

    const allowedChannels = input.is_mandatory
      ? requestedChannels
      : await this.preferencesService.filterEnabledChannels(
          receiver.id,
          type,
          requestedChannels,
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
          title: input.title,
          message: input.message,
          related_module: input.related_module ?? null,
          entity_type: input.entity_type ?? null,
          entity_id:
            input.entity_id === undefined || input.entity_id === null
              ? null
              : String(input.entity_id),
          branch_id: input.branch_id ?? null,
          department_id: input.department_id ?? null,
          action_url: input.action_url ?? null,
          metadata: input.metadata ?? null,
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

    await this.createDeliveryRows(created.id, allowedChannels);

    for (const channel of requestedChannels.filter(
      (c) => !allowedChannels.includes(c),
    )) {
      await this.deliveryRepository.save(
        this.deliveryRepository.create({
          notificationId: created.id,
          channel,
          status: NotificationDeliveryStatusEnum.SKIPPED,
          lastError: 'Skipped: disabled by recipient notification preferences',
        }),
      );
    }

    await this.outboxRepository.save(
      this.outboxRepository.create({ notificationId: created.id }),
    );

    const notification = await this.findOneForResponse(created.id);
    const response = this.mapNotification(notification);

    if (allowedChannels.includes(NotificationChannelEnum.IN_APP)) {
      this.gateway.emitToCompanyUser(input.receiver_company_user_id, response);
      await this.emitUnreadCount(
        input.company_id,
        input.receiver_company_user_id,
      );
    }

    return response;
  }

  async emitUnreadCount(companyId: number, receiverCompanyUserId: number) {
    const count = await this.notificationRepository.count({
      where: {
        company_id: companyId,
        receiver_company_user_id: receiverCompanyUserId,
        status: NotificationStatusEnum.UNREAD,
        archived_at: IsNull(),
      },
    });

    this.gateway.emitUnreadCount(receiverCompanyUserId, count);
  }

  private async createDeliveryRows(
    notificationId: number,
    channels: NotificationChannelEnum[],
  ) {
    for (const channel of channels) {
      await this.deliveryRepository.save(
        this.deliveryRepository.create({
          notificationId,
          channel,
          status:
            channel === NotificationChannelEnum.IN_APP
              ? NotificationDeliveryStatusEnum.DELIVERED
              : NotificationDeliveryStatusEnum.PENDING,
          deliveredAt:
            channel === NotificationChannelEnum.IN_APP ? new Date() : null,
        }),
      );
    }
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
