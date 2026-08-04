import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationStatusEnum } from './enums/notification-status.enum';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepository: Partial<jest.Mocked<Repository<AppNotification>>>;
  let companyUserRepository: Partial<jest.Mocked<Repository<CompanyUser>>>;
  let gateway: jest.Mocked<Partial<NotificationsGateway>>;
  let orchestrator: { create: jest.Mock };

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

    orchestrator = {
      create: jest.fn(),
    };

    service = new NotificationsService(
      notificationRepository as Repository<AppNotification>,
      companyUserRepository as Repository<CompanyUser>,
      gateway as NotificationsGateway,
      orchestrator as unknown as NotificationOrchestratorService,
    );
  });

  it('delegates createAndPush to the notification orchestrator with a default IN_APP channel', async () => {
    orchestrator.create.mockResolvedValue({ id: 12 });

    const result = await service.createAndPush({
      company_id: 4,
      receiver_company_user_id: 8,
      title: 'Existing',
      message: 'Existing notification',
      dedupe_key: 'dup-key',
    });

    expect(orchestrator.create).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 4,
        receiver_company_user_id: 8,
        dedupe_key: 'dup-key',
        channels: ['IN_APP'],
      }),
    );
    expect(result).toEqual({ id: 12 });
  });

  it('rejects markAsRead when the notification does not belong to the active tenant membership', async () => {
    notificationRepository.findOne!.mockResolvedValue(null);

    await expect(service.markAsRead(4, 8, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
