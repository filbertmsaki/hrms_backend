import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { buildPaginationMeta } from '../hr/shared/hr.utils';
import { NotificationCategoryEnum } from './enums/notification-category.enum';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationDeliveryStatusEnum } from './enums/notification-delivery-status.enum';
import { NotificationMailLogStatusEnum } from './enums/notification-mail-log-status.enum';
import { NotificationPriorityEnum } from './enums/notification-priority.enum';
import { NotificationDeliveryLogQueryDto } from './dto/notification-delivery-log-query.dto';
import { NotificationMailLogQueryDto } from './dto/notification-mail-log-query.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationMailLog } from './entities/notification-mail-log.entity';
import { NotificationStatusEnum } from './enums/notification-status.enum';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationQueueService } from './notification-queue.service';

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
  channels?: NotificationChannelEnum[];
  delivery_status?: NotificationDeliveryStatusEnum;
  dedupe_key?: string | null;
  expires_at?: Date | null;
  is_mandatory?: boolean;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(AppNotification)
    private readonly notificationRepository: Repository<AppNotification>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepository: Repository<NotificationDelivery>,
    @InjectRepository(NotificationMailLog)
    private readonly mailLogRepository: Repository<NotificationMailLog>,
    private readonly gateway: NotificationsGateway,
    private readonly orchestrator: NotificationOrchestratorService,
    private readonly notificationQueueService: NotificationQueueService,
  ) {}

  async createAndPush(input: CreateNotificationInput) {
    return this.orchestrator.create({
      ...input,
      channels: input.channels?.length
        ? input.channels
        : [input.delivery_channel ?? NotificationChannelEnum.IN_APP],
    });
  }

  async createAndPushMany(inputs: CreateNotificationInput[]) {
    const created: ReturnType<NotificationsService['mapNotification']>[] = [];

    for (const input of inputs) {
      created.push(await this.createAndPush(input));
    }

    return created;
  }

  async findMine(
    companyId: number,
    receiverCompanyUserId: number,
    query: NotificationQueryDto,
  ) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const skip = (page - 1) * limit;

    const qb = this.notificationRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.sender_company_user', 'senderMembership')
      .leftJoinAndSelect('senderMembership.user', 'senderUser')
      .leftJoinAndSelect(
        'notification.receiver_company_user',
        'receiverMembership',
      )
      .leftJoinAndSelect('receiverMembership.user', 'receiverUser')
      .where('notification.company_id = :companyId', { companyId })
      .andWhere(
        'notification.receiver_company_user_id = :receiverCompanyUserId',
        {
          receiverCompanyUserId,
        },
      );

    if (!query.include_archived) {
      qb.andWhere('notification.archived_at IS NULL');
    }

    qb.andWhere(
      '(notification.expires_at IS NULL OR notification.expires_at > :now)',
      { now: new Date() },
    );

    if (query.status) {
      qb.andWhere('notification.status = :status', { status: query.status });
    }

    if (query.type) {
      qb.andWhere('notification.type = :type', { type: query.type });
    }

    if (query.category) {
      qb.andWhere('notification.category = :category', {
        category: query.category,
      });
    }

    if (query.priority) {
      qb.andWhere('notification.priority = :priority', {
        priority: query.priority,
      });
    }

    if (query.related_module) {
      qb.andWhere('notification.related_module = :relatedModule', {
        relatedModule: query.related_module,
      });
    }

    if (query.entity_type) {
      qb.andWhere('notification.entity_type = :entityType', {
        entityType: query.entity_type,
      });
    }

    if (query.entity_id) {
      qb.andWhere('notification.entity_id = :entityId', {
        entityId: query.entity_id,
      });
    }

    if (typeof query.seen === 'boolean') {
      qb.andWhere(
        query.seen
          ? 'notification.seen_at IS NOT NULL'
          : 'notification.seen_at IS NULL',
      );
    }

    if (query.search) {
      qb.andWhere(
        '(LOWER(notification.title) LIKE :search OR LOWER(notification.message) LIKE :search)',
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    qb.orderBy('notification.created_at', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const deliveryRows = items.length
      ? await this.deliveryRepository.find({
          where: { notificationId: In(items.map((item) => item.id)) },
          select: { notificationId: true, channel: true, status: true },
        })
      : [];
    const channelsByNotification = new Map<
      number,
      Array<{ channel: string; status: string }>
    >();
    for (const delivery of deliveryRows) {
      const rows = channelsByNotification.get(delivery.notificationId) ?? [];
      rows.push({ channel: delivery.channel, status: delivery.status });
      channelsByNotification.set(delivery.notificationId, rows);
    }

    return {
      data: items.map((item) =>
        this.mapNotification(item, channelsByNotification.get(item.id) ?? []),
      ),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async findUnread(
    companyId: number,
    receiverCompanyUserId: number,
    query: NotificationQueryDto,
  ) {
    return this.findMine(companyId, receiverCompanyUserId, {
      ...query,
      status: NotificationStatusEnum.UNREAD,
    });
  }

  async findOneMine(
    companyId: number,
    receiverCompanyUserId: number,
    notificationId: number,
  ) {
    const notification = await this.notificationRepository.findOne({
      where: {
        id: notificationId,
        company_id: companyId,
        receiver_company_user_id: receiverCompanyUserId,
      },
      relations: {
        sender_company_user: { user: true },
        receiver_company_user: { user: true },
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.mapNotification(notification);
  }

  async getDashboardStats(companyId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalNotifications,
      unreadNotifications,
      sentToday,
      failedEmailDeliveries,
      failedPushDeliveries,
      pendingDeliveries,
      byModule,
      byType,
      failedDeliveries,
    ] = await Promise.all([
      this.notificationRepository.count({ where: { company_id: companyId } }),
      this.notificationRepository.count({
        where: {
          company_id: companyId,
          status: NotificationStatusEnum.UNREAD,
        },
      }),
      this.deliveryRepository
        .createQueryBuilder('delivery')
        .innerJoin('delivery.notification', 'notification')
        .where('notification.company_id = :companyId', { companyId })
        .andWhere('delivery.status = :status', {
          status: NotificationDeliveryStatusEnum.DELIVERED,
        })
        .andWhere('delivery.deliveredAt >= :today', { today })
        .getCount(),
      this.deliveryRepository
        .createQueryBuilder('delivery')
        .innerJoin('delivery.notification', 'notification')
        .where('notification.company_id = :companyId', { companyId })
        .andWhere('delivery.channel = :channel', {
          channel: NotificationChannelEnum.EMAIL,
        })
        .andWhere('delivery.status = :status', {
          status: NotificationDeliveryStatusEnum.FAILED,
        })
        .getCount(),
      this.deliveryRepository
        .createQueryBuilder('delivery')
        .innerJoin('delivery.notification', 'notification')
        .where('notification.company_id = :companyId', { companyId })
        .andWhere('delivery.channel = :channel', {
          channel: NotificationChannelEnum.PUSH,
        })
        .andWhere('delivery.status = :status', {
          status: NotificationDeliveryStatusEnum.FAILED,
        })
        .getCount(),
      this.deliveryRepository
        .createQueryBuilder('delivery')
        .innerJoin('delivery.notification', 'notification')
        .where('notification.company_id = :companyId', { companyId })
        .andWhere('delivery.status = :status', {
          status: NotificationDeliveryStatusEnum.PENDING,
        })
        .getCount(),
      this.notificationRepository
        .createQueryBuilder('notification')
        .select("COALESCE(notification.related_module, 'general')", 'module')
        .addSelect('COUNT(*)', 'count')
        .where('notification.company_id = :companyId', { companyId })
        .groupBy("COALESCE(notification.related_module, 'general')")
        .orderBy('count', 'DESC')
        .getRawMany<{ module: string; count: string }>(),
      this.notificationRepository
        .createQueryBuilder('notification')
        .select('notification.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .where('notification.company_id = :companyId', { companyId })
        .groupBy('notification.type')
        .orderBy('count', 'DESC')
        .getRawMany<{ type: string; count: string }>(),
      this.deliveryRepository
        .createQueryBuilder('delivery')
        .innerJoin('delivery.notification', 'notification')
        .where('notification.company_id = :companyId', { companyId })
        .andWhere('delivery.status = :status', {
          status: NotificationDeliveryStatusEnum.FAILED,
        })
        .getCount(),
    ]);

    return {
      total_notifications: totalNotifications,
      unread_notifications: unreadNotifications,
      sent_today: sentToday,
      email_delivery_failures: failedEmailDeliveries,
      push_notification_failures: failedPushDeliveries,
      pending_queue: pendingDeliveries,
      failed_jobs: failedDeliveries,
      notifications_by_module: byModule.map((row) => ({
        module: row.module,
        count: Number(row.count),
      })),
      notifications_by_type: byType.map((row) => ({
        type: row.type,
        count: Number(row.count),
      })),
    };
  }

  async listDeliveryLogs(
    companyId: number,
    query: NotificationDeliveryLogQueryDto,
  ) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);

    const qb = this.deliveryRepository
      .createQueryBuilder('delivery')
      .leftJoinAndSelect('delivery.notification', 'notification')
      .leftJoinAndSelect(
        'notification.receiver_company_user',
        'receiverMembership',
      )
      .leftJoinAndSelect('receiverMembership.user', 'receiverUser')
      .where('notification.company_id = :companyId', { companyId });

    if (query.channel) {
      qb.andWhere('delivery.channel = :channel', { channel: query.channel });
    }

    if (query.status) {
      qb.andWhere('delivery.status = :status', { status: query.status });
    }

    if (query.notification_id) {
      qb.andWhere('delivery.notificationId = :notificationId', {
        notificationId: query.notification_id,
      });
    }

    if (query.receiver_company_user_id) {
      qb.andWhere(
        'notification.receiver_company_user_id = :receiverCompanyUserId',
        { receiverCompanyUserId: query.receiver_company_user_id },
      );
    }

    if (query.related_module?.trim()) {
      qb.andWhere('notification.related_module = :relatedModule', {
        relatedModule: query.related_module.trim(),
      });
    }

    if (query.entity_type?.trim()) {
      qb.andWhere('notification.entity_type = :entityType', {
        entityType: query.entity_type.trim(),
      });
    }

    if (query.entity_id?.trim()) {
      qb.andWhere('notification.entity_id = :entityId', {
        entityId: query.entity_id.trim(),
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        `(
          LOWER(notification.title) LIKE :search OR
          LOWER(notification.message) LIKE :search OR
          LOWER(COALESCE(delivery.recipientAddress, '')) LIKE :search OR
          LOWER(COALESCE(receiverUser.email, '')) LIKE :search
        )`,
        { search: `%${query.search.trim().toLowerCase()}%` },
      );
    }

    const [items, total] = await qb
      .orderBy('delivery.createdAt', 'DESC')
      .addOrderBy('delivery.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapDeliveryLog(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async getDeliveryLog(companyId: number, deliveryId: number) {
    const delivery = await this.deliveryRepository
      .createQueryBuilder('delivery')
      .leftJoinAndSelect('delivery.notification', 'notification')
      .leftJoinAndSelect(
        'notification.receiver_company_user',
        'receiverMembership',
      )
      .leftJoinAndSelect('receiverMembership.user', 'receiverUser')
      .where('delivery.id = :deliveryId', { deliveryId })
      .andWhere('notification.company_id = :companyId', { companyId })
      .getOne();

    if (!delivery) {
      throw new NotFoundException('Notification delivery log not found');
    }

    return this.mapDeliveryLog(delivery);
  }

  async listMailLogs(companyId: number, query: NotificationMailLogQueryDto) {
    return this.listMailLogsWithScope(query, { companyId });
  }

  async listPlatformMailLogs(query: NotificationMailLogQueryDto) {
    return this.listMailLogsWithScope(query, { platformScope: true });
  }

  async getPlatformMailLog(mailLogId: number) {
    const mailLog = await this.mailLogRepository.findOne({
      where: { id: mailLogId },
    });

    if (!mailLog) {
      throw new NotFoundException('Notification mail log not found');
    }

    return this.mapMailLog(mailLog);
  }

  async retryPlatformMailLog(mailLogId: number) {
    const mailLog = await this.mailLogRepository.findOne({
      where: { id: mailLogId },
    });

    if (!mailLog) {
      throw new NotFoundException('Notification mail log not found');
    }

    return this.retryMailLogInternal(mailLog);
  }

  private async listMailLogsWithScope(
    query: NotificationMailLogQueryDto,
    scope: { companyId?: number; platformScope?: boolean },
  ) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);

    const qb = this.mailLogRepository.createQueryBuilder('mailLog');

    if (scope.platformScope) {
      if (query.only_unscoped) {
        qb.where('mailLog.companyId IS NULL');
      } else if (query.company_id) {
        qb.where('mailLog.companyId = :companyId', {
          companyId: query.company_id,
        });
      } else {
        qb.where('1 = 1');
      }
    } else {
      qb.where('mailLog.companyId = :companyId', {
        companyId: scope.companyId,
      });
    }

    if (query.status) {
      qb.andWhere('mailLog.status = :status', { status: query.status });
    }

    if (query.method?.trim()) {
      qb.andWhere('mailLog.method = :method', { method: query.method.trim() });
    }

    if (query.recipient_email?.trim()) {
      qb.andWhere('LOWER(mailLog.recipientEmail) = :recipientEmail', {
        recipientEmail: query.recipient_email.trim().toLowerCase(),
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        `(
          LOWER(mailLog.method) LIKE :search OR
          LOWER(COALESCE(mailLog.recipientEmail, '')) LIKE :search OR
          LOWER(COALESCE(mailLog.errorMessage, '')) LIKE :search
        )`,
        { search: `%${query.search.trim().toLowerCase()}%` },
      );
    }

    const [items, total] = await qb
      .orderBy('mailLog.createdAt', 'DESC')
      .addOrderBy('mailLog.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapMailLog(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async getMailLog(companyId: number, mailLogId: number) {
    const mailLog = await this.mailLogRepository.findOne({
      where: { id: mailLogId, companyId },
    });

    if (!mailLog) {
      throw new NotFoundException('Notification mail log not found');
    }

    return this.mapMailLog(mailLog);
  }

  async retryMailLog(companyId: number, mailLogId: number) {
    const mailLog = await this.mailLogRepository.findOne({
      where: { id: mailLogId, companyId },
    });

    if (!mailLog) {
      throw new NotFoundException('Notification mail log not found');
    }

    return this.retryMailLogInternal(mailLog);
  }

  private async retryMailLogInternal(mailLog: NotificationMailLog) {
    if (mailLog.status !== NotificationMailLogStatusEnum.FAILED) {
      throw new BadRequestException(
        'Only failed queued mail logs can be retried.',
      );
    }

    if (!Array.isArray(mailLog.args)) {
      throw new BadRequestException(
        'This queued mail log does not contain retryable arguments.',
      );
    }

    await this.notificationQueueService.enqueueMailMethod(
      mailLog.method,
      mailLog.args,
      {
        retryOfMailLogId: mailLog.id,
        companyId: mailLog.companyId,
      },
    );

    return { message: 'Queued email retry scheduled successfully.' };
  }

  async getUnreadCount(companyId: number, receiverCompanyUserId: number) {
    const count = await this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.company_id = :companyId', { companyId })
      .andWhere(
        'notification.receiver_company_user_id = :receiverCompanyUserId',
        { receiverCompanyUserId },
      )
      .andWhere('notification.status = :status', {
        status: NotificationStatusEnum.UNREAD,
      })
      .andWhere('notification.archived_at IS NULL')
      .andWhere(
        '(notification.expires_at IS NULL OR notification.expires_at > :now)',
        { now: new Date() },
      )
      .getCount();

    return { unread_count: count };
  }

  async markAsSeen(
    companyId: number,
    receiverCompanyUserId: number,
    notificationId: number,
  ) {
    const notification = await this.findOwnedNotificationOrFail(
      companyId,
      receiverCompanyUserId,
      notificationId,
    );

    if (!notification.seen_at) {
      notification.seen_at = new Date();
      await this.notificationRepository.save(notification);
    }

    const response = this.mapNotification(notification);
    this.gateway.emitNotificationUpdate(receiverCompanyUserId, response);
    return response;
  }

  async markAsRead(
    companyId: number,
    receiverCompanyUserId: number,
    notificationId: number,
  ) {
    const notification = await this.findOwnedNotificationOrFail(
      companyId,
      receiverCompanyUserId,
      notificationId,
    );

    if (notification.status !== NotificationStatusEnum.READ) {
      const now = new Date();
      notification.status = NotificationStatusEnum.READ;
      notification.seen_at = notification.seen_at ?? now;
      notification.read_at = now;
      await this.notificationRepository.save(notification);
    }

    const response = this.mapNotification(notification);
    this.gateway.emitNotificationUpdate(receiverCompanyUserId, response);
    await this.emitUnreadCount(companyId, receiverCompanyUserId);
    return response;
  }

  async markAllAsRead(companyId: number, receiverCompanyUserId: number) {
    const now = new Date();

    await this.notificationRepository
      .createQueryBuilder()
      .update(AppNotification)
      .set({
        status: NotificationStatusEnum.READ,
        seen_at: now,
        read_at: now,
      })
      .where('company_id = :companyId', { companyId })
      .andWhere('receiver_company_user_id = :receiverCompanyUserId', {
        receiverCompanyUserId,
      })
      .andWhere('status = :status', { status: NotificationStatusEnum.UNREAD })
      .andWhere('archived_at IS NULL')
      .execute();

    await this.emitUnreadCount(companyId, receiverCompanyUserId);
    this.gateway.emitNotificationBulkUpdate(receiverCompanyUserId, {
      action: 'mark_all_as_read',
      read_at: now,
    });

    return { message: 'All notifications marked as read' };
  }

  async archive(
    companyId: number,
    receiverCompanyUserId: number,
    notificationId: number,
  ) {
    const notification = await this.findOwnedNotificationOrFail(
      companyId,
      receiverCompanyUserId,
      notificationId,
    );

    if (!notification.archived_at) {
      notification.archived_at = new Date();
      await this.notificationRepository.save(notification);
    }

    const response = this.mapNotification(notification);
    this.gateway.emitNotificationUpdate(receiverCompanyUserId, response);
    await this.emitUnreadCount(companyId, receiverCompanyUserId);
    return response;
  }

  assertCompanyActor(actor: AuthenticatedUser): {
    companyId: number;
    companyMembershipId: number;
  } {
    if (!actor.companyId || !actor.companyMembershipId) {
      throw new ForbiddenException('Active company context is required');
    }

    return {
      companyId: actor.companyId,
      companyMembershipId: actor.companyMembershipId,
    };
  }

  private async emitUnreadCount(
    companyId: number,
    receiverCompanyUserId: number,
  ) {
    const { unread_count } = await this.getUnreadCount(
      companyId,
      receiverCompanyUserId,
    );

    this.gateway.emitUnreadCount(receiverCompanyUserId, unread_count);
  }

  private async findOwnedNotificationOrFail(
    companyId: number,
    receiverCompanyUserId: number,
    notificationId: number,
  ) {
    const notification = await this.notificationRepository.findOne({
      where: {
        id: notificationId,
        company_id: companyId,
        receiver_company_user_id: receiverCompanyUserId,
        archived_at: IsNull(),
      },
      relations: {
        sender_company_user: { user: true },
        receiver_company_user: { user: true },
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  private mapNotification(
    notification: AppNotification,
    deliveryChannels: Array<{ channel: string; status: string }> = [],
  ) {
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
      delivery_channels: deliveryChannels,
      delivery_status: notification.delivery_status,
      dedupe_key: notification.dedupe_key,
      expires_at: notification.expires_at,
      archived_at: notification.archived_at,
      is_read: notification.status === NotificationStatusEnum.READ,
      is_seen: Boolean(notification.seen_at),
      is_archived: Boolean(notification.archived_at),
      created_at: notification.created_at,
      updated_at: notification.updated_at,
    };
  }

  private mapDeliveryLog(delivery: NotificationDelivery) {
    return {
      id: delivery.id,
      notification_id: delivery.notificationId,
      channel: delivery.channel,
      status: delivery.status,
      recipient_address: delivery.recipientAddress,
      attempt_count: delivery.attemptCount,
      last_attempt_at: delivery.lastAttemptAt,
      next_retry_at: delivery.nextRetryAt,
      delivered_at: delivery.deliveredAt,
      provider_message_id: delivery.providerMessageId,
      last_error: delivery.lastError,
      metadata: delivery.metadata,
      created_at: delivery.createdAt,
      updated_at: delivery.updatedAt,
      notification: delivery.notification
        ? {
            id: delivery.notification.id,
            company_id: delivery.notification.company_id,
            receiver_company_user_id:
              delivery.notification.receiver_company_user_id,
            receiver_email:
              delivery.notification.receiver_company_user?.user?.email ?? null,
            title: delivery.notification.title,
            message: delivery.notification.message,
            type: delivery.notification.type,
            category: delivery.notification.category,
            priority: delivery.notification.priority,
            related_module: delivery.notification.related_module,
            entity_type: delivery.notification.entity_type,
            entity_id: delivery.notification.entity_id,
            action_url: delivery.notification.action_url,
            delivery_channel: delivery.notification.delivery_channel,
            delivery_status: delivery.notification.delivery_status,
            created_at: delivery.notification.created_at,
            updated_at: delivery.notification.updated_at,
          }
        : null,
    };
  }

  private mapMailLog(mailLog: NotificationMailLog) {
    return {
      id: mailLog.id,
      company_id: mailLog.companyId,
      method: mailLog.method,
      recipient_email: mailLog.recipientEmail,
      args: mailLog.args,
      status: mailLog.status,
      provider_message_id: mailLog.providerMessageId,
      provider_response: mailLog.providerResponse,
      error_message: mailLog.errorMessage,
      processed_at: mailLog.processedAt,
      retry_of_log_id: mailLog.retryOfLogId,
      created_at: mailLog.createdAt,
      updated_at: mailLog.updatedAt,
    };
  }
}
