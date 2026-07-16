import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { NotificationCategoryEnum } from './enums/notification-category.enum';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationDeliveryStatusEnum } from './enums/notification-delivery-status.enum';
import { NotificationPriorityEnum } from './enums/notification-priority.enum';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationStatusEnum } from './enums/notification-status.enum';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { NotificationsGateway } from './notifications.gateway';

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
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(AppNotification)
    private readonly notificationRepository: Repository<AppNotification>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    private readonly gateway: NotificationsGateway,
  ) {}

  async createAndPush(input: CreateNotificationInput) {
    await this.ensureReceiverBelongsToCompany(
      input.company_id,
      input.receiver_company_user_id,
    );

    if (input.dedupe_key?.trim()) {
      const existing = await this.notificationRepository.findOne({
        where: {
          company_id: input.company_id,
          receiver_company_user_id: input.receiver_company_user_id,
          dedupe_key: input.dedupe_key.trim(),
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

    const created = await this.notificationRepository.save(
      this.notificationRepository.create({
        company_id: input.company_id,
        sender_company_user_id: input.sender_company_user_id ?? null,
        receiver_company_user_id: input.receiver_company_user_id,
        type: (input.type ??
          NotificationTypeEnum.GENERAL) as NotificationTypeEnum,
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
          input.delivery_channel ?? NotificationChannelEnum.IN_APP,
        delivery_status:
          input.delivery_status ?? NotificationDeliveryStatusEnum.DELIVERED,
        dedupe_key: input.dedupe_key?.trim() || null,
        expires_at: input.expires_at ?? null,
        archived_at: null,
      }),
    );

    const notification = await this.findOneForResponse(created.id);
    const response = this.mapNotification(notification);

    this.gateway.emitToCompanyUser(input.receiver_company_user_id, response);
    await this.emitUnreadCount(
      input.company_id,
      input.receiver_company_user_id,
    );

    return response;
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

    return {
      data: items.map((item) => this.mapNotification(item)),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getUnreadCount(companyId: number, receiverCompanyUserId: number) {
    const count = await this.notificationRepository.count({
      where: {
        company_id: companyId,
        receiver_company_user_id: receiverCompanyUserId,
        status: NotificationStatusEnum.UNREAD,
        archived_at: IsNull(),
      },
    });

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

  private async ensureReceiverBelongsToCompany(
    companyId: number,
    receiverCompanyUserId: number,
  ) {
    const receiver = await this.companyUserRepository.findOne({
      where: {
        id: receiverCompanyUserId,
        company_id: companyId,
      },
    });

    if (!receiver) {
      throw new NotFoundException('Notification receiver not found');
    }
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

  private async findOneForResponse(id: number): Promise<AppNotification> {
    return this.notificationRepository.findOneOrFail({
      where: { id },
      relations: {
        sender_company_user: { user: true },
        receiver_company_user: { user: true },
      },
    });
  }

  private mapNotification(notification: AppNotification) {
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
      is_read: notification.status === NotificationStatusEnum.READ,
      is_seen: Boolean(notification.seen_at),
      is_archived: Boolean(notification.archived_at),
      created_at: notification.created_at,
      updated_at: notification.updated_at,
    };
  }
}
