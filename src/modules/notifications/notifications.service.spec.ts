import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationStatusEnum } from './enums/notification-status.enum';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepository: Partial<jest.Mocked<Repository<AppNotification>>>;
  let companyUserRepository: Partial<jest.Mocked<Repository<CompanyUser>>>;
  let gateway: jest.Mocked<Partial<NotificationsGateway>>;

  beforeEach(() => {
    notificationRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      findOneOrFail: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(),
    };

    companyUserRepository = {
      findOne: jest.fn(),
    };

    gateway = {
      emitToCompanyUser: jest.fn(),
      emitUnreadCount: jest.fn(),
      emitNotificationUpdate: jest.fn(),
      emitNotificationBulkUpdate: jest.fn(),
    };

    service = new NotificationsService(
      notificationRepository as Repository<AppNotification>,
      companyUserRepository as Repository<CompanyUser>,
      gateway as NotificationsGateway,
    );
  });

  it('returns an existing notification instead of creating a duplicate when dedupe_key matches', async () => {
    companyUserRepository.findOne!.mockResolvedValue({
      id: 8,
      company_id: 4,
    } as CompanyUser);

    notificationRepository.findOne!.mockResolvedValue({
      id: 12,
      company_id: 4,
      sender_company_user_id: 3,
      receiver_company_user_id: 8,
      type: 'GENERAL',
      category: 'GENERAL',
      priority: 'MEDIUM',
      title: 'Existing',
      message: 'Existing notification',
      related_module: 'leave',
      entity_type: 'LEAVE_REQUEST',
      entity_id: '99',
      branch_id: null,
      department_id: null,
      action_url: '/leave/99',
      metadata: null,
      status: NotificationStatusEnum.UNREAD,
      seen_at: null,
      read_at: null,
      delivery_channel: 'IN_APP',
      delivery_status: 'DELIVERED',
      dedupe_key: 'dup-key',
      expires_at: null,
      archived_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      sender_company_user: null,
      receiver_company_user: null,
    } as unknown as AppNotification);

    const result = await service.createAndPush({
      company_id: 4,
      receiver_company_user_id: 8,
      title: 'Existing',
      message: 'Existing notification',
      dedupe_key: 'dup-key',
    });

    expect(notificationRepository.save).not.toHaveBeenCalled();
    expect(gateway.emitToCompanyUser).not.toHaveBeenCalled();
    expect(result.id).toBe(12);
    expect(result.dedupe_key).toBe('dup-key');
  });

  it('rejects markAsRead when the notification does not belong to the active tenant membership', async () => {
    notificationRepository.findOne!.mockResolvedValue(null);

    await expect(service.markAsRead(4, 8, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
