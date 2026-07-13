import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationStatusEnum } from './enums/notification-status.enum';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { NotificationsGateway } from './notifications.gateway';

export type CreateNotificationInput = {
  company_id: number;
  sender_company_user_id?: number | null;
  receiver_company_user_id: number;
  type?: string;
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | number | null;
  action_url?: string | null;
  metadata?: Record<string, unknown> | null;
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

    const created = await this.notificationRepository.save(
      this.notificationRepository.create({
        company_id: input.company_id,
        sender_company_user_id: input.sender_company_user_id ?? null,
        receiver_company_user_id: input.receiver_company_user_id,
        type: (input.type ??
          NotificationTypeEnum.GENERAL) as NotificationTypeEnum,
        title: input.title,
        message: input.message,
        entity_type: input.entity_type ?? null,
        entity_id:
          input.entity_id === undefined || input.entity_id === null
            ? null
            : String(input.entity_id),
        action_url: input.action_url ?? null,
        metadata: input.metadata ?? null,
        status: NotificationStatusEnum.UNREAD,
        read_at: null,
      }),
    );

    const notification = await this.findOneForResponse(created.id);
    const response = this.mapNotification(notification);

    this.gateway.emitToCompanyUser(input.receiver_company_user_id, response);

    return response;
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

    if (query.status) {
      qb.andWhere('notification.status = :status', { status: query.status });
    }

    if (query.type) {
      qb.andWhere('notification.type = :type', { type: query.type });
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
      },
    });

    return { unread_count: count };
  }

  async markAsRead(
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

    if (notification.status !== NotificationStatusEnum.READ) {
      notification.status = NotificationStatusEnum.READ;
      notification.read_at = new Date();
      await this.notificationRepository.save(notification);
    }

    return this.mapNotification(notification);
  }

  async markAllAsRead(companyId: number, receiverCompanyUserId: number) {
    await this.notificationRepository.update(
      {
        company_id: companyId,
        receiver_company_user_id: receiverCompanyUserId,
        status: NotificationStatusEnum.UNREAD,
      },
      {
        status: NotificationStatusEnum.READ,
        read_at: new Date(),
      },
    );

    return { message: 'All notifications marked as read' };
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
      title: notification.title,
      message: notification.message,
      entity_type: notification.entity_type,
      entity_id: notification.entity_id,
      action_url: notification.action_url,
      metadata: notification.metadata,
      status: notification.status,
      read_at: notification.read_at,
      created_at: notification.created_at,
      updated_at: notification.updated_at,
    };
  }
}
