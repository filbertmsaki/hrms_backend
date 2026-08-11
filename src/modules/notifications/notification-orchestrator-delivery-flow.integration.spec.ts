import { DataSource, EntityManager, Repository } from 'typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { AppNotification } from './entities/app-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationOutboxEvent } from './entities/notification-outbox-event.entity';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationDeliveryStatusEnum } from './enums/notification-delivery-status.enum';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { NotificationDeliveryDispatcherService } from './notification-delivery-dispatcher.service';
import { NotificationChannelManagementService } from './notification-channel-management.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsGateway } from './notifications.gateway';
import { unsupportedNotificationChannelMessage } from './notification-channel-policy';

/**
 * Exercises the real orchestrator + dispatcher together (not just each in
 * isolation) to prove that a notification created with an EMAIL channel
 * actually gets an outbox event, a pending delivery row, and that the
 * dispatcher picks it up, sends it, and marks it DELIVERED end to end.
 */
describe('Notification orchestrator -> delivery flow (integration)', () => {
  const notificationChannelManagementService = {
    resolveEnabledChannels: jest.fn(
      async ({ channels }: { channels: NotificationChannelEnum[] }) => ({
        enabledChannels: channels,
        disabledChannels: [],
      }),
    ),
    evaluateChannel: jest.fn(async () => ({ enabled: true, reason: null })),
    resolveDeliveryCode: jest.fn(
      ({ type }: { type?: string | null }) =>
        type ?? NotificationTypeEnum.GENERAL,
    ),
  } as unknown as NotificationChannelManagementService;

  const buildQueryBuilder = (overrides: Record<string, unknown> = {}) => {
    const builder: Record<string, jest.Mock> = {
      setLock: jest.fn(),
      update: jest.fn(),
      set: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      execute: jest.fn().mockResolvedValue(undefined),
      getOne: jest.fn().mockResolvedValue(null),
    };
    builder.setLock.mockReturnValue(builder);
    builder.update.mockReturnValue(builder);
    builder.set.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    builder.andWhere.mockReturnValue(builder);
    Object.assign(builder, overrides);
    return builder;
  };

  it('creates a pending EMAIL delivery and the dispatcher delivers it', async () => {
    const companyId = 4;
    const receiverCompanyUserId = 8;

    const receiver = {
      id: receiverCompanyUserId,
      company_id: companyId,
      user: {
        email: 'receiver@example.com',
        phone: '+255712345678',
        first_name: 'Rita',
        last_name: 'Receiver',
      },
    } as unknown as CompanyUser;

    const notificationStore = new Map<number, AppNotification>();
    let nextNotificationId = 1;
    const notificationRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(
        (input: Partial<AppNotification>) => input as AppNotification,
      ),
      save: jest.fn(async (entity: AppNotification) => {
        const saved = {
          ...entity,
          id: entity.id ?? nextNotificationId++,
        } as AppNotification;
        notificationStore.set(saved.id, saved);
        return saved;
      }),
      findOneOrFail: jest.fn(async ({ where }: { where: { id: number } }) => {
        const found = notificationStore.get(where.id);
        if (!found) throw new Error('not found');
        return {
          ...found,
          sender_company_user: null,
          receiver_company_user: receiver,
        };
      }),
      update: jest.fn(async (id: number, patch: Partial<AppNotification>) => {
        const found = notificationStore.get(id);
        if (found) Object.assign(found, patch);
      }),
      count: jest.fn().mockResolvedValue(0),
    };

    const companyUserRepository = {
      findOne: jest.fn().mockResolvedValue(receiver),
    };

    const deliveryStore = new Map<number, NotificationDelivery>();
    let nextDeliveryId = 1;
    const deliveryRepository = {
      create: jest.fn(
        (input: Partial<NotificationDelivery>) =>
          ({ ...input }) as NotificationDelivery,
      ),
      save: jest.fn(async (entity: NotificationDelivery) => {
        const saved = {
          ...entity,
          id: entity.id ?? nextDeliveryId++,
        } as NotificationDelivery;
        deliveryStore.set(saved.id, saved);
        return saved;
      }),
      find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        Array.from(deliveryStore.values()).filter((delivery) => {
          if (
            where.notificationId !== undefined &&
            delivery.notificationId !== where.notificationId
          ) {
            return false;
          }
          if (where.status !== undefined && delivery.status !== where.status) {
            return false;
          }
          return true;
        }),
      ),
      findOne: jest.fn(async ({ where }: { where: { id: number } }) => {
        const found = deliveryStore.get(where.id);
        if (!found) return null;
        return {
          ...found,
          notification: {
            ...notificationStore.get(found.notificationId)!,
            receiver_company_user: receiver,
          },
        };
      }),
    };

    const outboxStore = new Map<number, NotificationOutboxEvent>();
    let nextOutboxId = 1;
    const outboxRepository = {
      create: jest.fn(
        (input: Partial<NotificationOutboxEvent>) =>
          ({
            status: 'PENDING',
            attemptCount: 0,
            ...input,
          }) as NotificationOutboxEvent,
      ),
      save: jest.fn(async (entity: NotificationOutboxEvent) => {
        const saved = {
          ...entity,
          id: entity.id ?? nextOutboxId++,
        } as NotificationOutboxEvent;
        outboxStore.set(saved.id, saved);
        return saved;
      }),
      find: jest.fn(async ({ where }: { where: { status: string } }) =>
        Array.from(outboxStore.values()).filter(
          (event) => event.status === where.status,
        ),
      ),
      findOneOrFail: jest.fn(async ({ where }: { where: { id: number } }) => {
        const found = outboxStore.get(where.id);
        if (!found) throw new Error('not found');
        return found;
      }),
      update: jest.fn(
        async (id: number, patch: Partial<NotificationOutboxEvent>) => {
          const found = outboxStore.get(id);
          if (found) Object.assign(found, patch);
        },
      ),
      createQueryBuilder: jest.fn(() =>
        buildQueryBuilder({
          getOne: jest.fn(() => Promise.resolve(outboxStore.get(1) ?? null)),
        }),
      ),
    };

    const gateway = {
      emitToCompanyUser: jest.fn(),
      emitUnreadCount: jest.fn(),
    } as unknown as NotificationsGateway;

    const preferencesService = {
      filterEnabledChannels: jest.fn(
        async (
          _id: number,
          _type: NotificationTypeEnum,
          channels: NotificationChannelEnum[],
        ) => channels,
      ),
    } as unknown as NotificationPreferencesService;
    const notificationQueueService = {
      enqueueOutboxEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationQueueService;

    const orchestrator = new NotificationOrchestratorService(
      notificationRepository as unknown as Repository<AppNotification>,
      companyUserRepository as unknown as Repository<CompanyUser>,
      deliveryRepository as unknown as Repository<NotificationDelivery>,
      outboxRepository as unknown as Repository<NotificationOutboxEvent>,
      gateway,
      preferencesService,
      notificationChannelManagementService,
      notificationQueueService,
    );

    const created = await orchestrator.create({
      company_id: companyId,
      receiver_company_user_id: receiverCompanyUserId,
      type: NotificationTypeEnum.GENERAL,
      title: 'Your report is ready',
      message: 'Your scheduled report has been generated.',
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
    });

    expect(created.id).toBeDefined();

    const emailDelivery = Array.from(deliveryStore.values()).find(
      (delivery) => delivery.channel === NotificationChannelEnum.EMAIL,
    );
    expect(emailDelivery).toBeDefined();
    expect(emailDelivery!.status).toBe(NotificationDeliveryStatusEnum.PENDING);
    expect(emailDelivery!.recipientAddress).toBe('receiver@example.com');

    const outboxEvent = Array.from(outboxStore.values())[0];
    expect(outboxEvent.status).toBe('PENDING');
    expect(outboxEvent.notificationId).toBe(created.id);

    // Rewire the query-builder mock so processOutboxEvent's transaction path
    // actually finds and claims this outbox event.
    outboxRepository.createQueryBuilder.mockImplementation(() =>
      buildQueryBuilder({
        getOne: jest.fn(() =>
          Promise.resolve(outboxStore.get(outboxEvent.id) ?? null),
        ),
      }),
    );

    const dataSource = {
      transaction: jest.fn(
        (callback: (manager: EntityManager) => Promise<unknown>) => {
          const manager = {
            getRepository: jest.fn(() => outboxRepository),
          } as unknown as EntityManager;
          return callback(manager);
        },
      ),
    } as unknown as DataSource;

    const mailService = {
      sendGenericNotificationEmail: jest
        .fn()
        .mockResolvedValue({ messageId: 'msg-1', response: '250 queued' }),
    } as unknown as MailService;
    const smsService = {
      isConfigured: jest.fn().mockReturnValue(true),
      getConfigurationError: jest.fn().mockReturnValue(null),
      sendGenericNotificationSms: jest.fn(),
    } as unknown as SmsService;

    const dispatcher = new NotificationDeliveryDispatcherService(
      dataSource,
      outboxRepository as unknown as Repository<NotificationOutboxEvent>,
      deliveryRepository as unknown as Repository<NotificationDelivery>,
      notificationRepository as unknown as Repository<AppNotification>,
      {
        runWithLock: jest.fn(
          async (_key: string, callback: () => Promise<unknown>) => ({
            acquired: true,
            result: await callback(),
          }),
        ),
      } as never,
      mailService,
      smsService,
      gateway,
      notificationChannelManagementService,
    );

    await dispatcher.dispatch();

    expect(mailService.sendGenericNotificationEmail).toHaveBeenCalledWith(
      'receiver@example.com',
      'Your report is ready',
      'Your scheduled report has been generated.',
      null,
    );

    const deliveredEmail = deliveryStore.get(emailDelivery!.id);
    expect(deliveredEmail!.status).toBe(
      NotificationDeliveryStatusEnum.DELIVERED,
    );
    expect(deliveredEmail!.recipientAddress).toBe('receiver@example.com');
    expect(outboxStore.get(outboxEvent.id)!.status).toBe('PROCESSED');
  });

  it('creates a pending SMS delivery and the dispatcher delivers it', async () => {
    const companyId = 5;
    const receiverCompanyUserId = 9;

    const receiver = {
      id: receiverCompanyUserId,
      company_id: companyId,
      user: {
        email: 'receiver@example.com',
        phone: '+255754000111',
        first_name: 'Rita',
        last_name: 'Receiver',
      },
    } as unknown as CompanyUser;

    const notificationStore = new Map<number, AppNotification>();
    let nextNotificationId = 1;
    const notificationRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(
        (input: Partial<AppNotification>) => input as AppNotification,
      ),
      save: jest.fn(async (entity: AppNotification) => {
        const saved = {
          ...entity,
          id: entity.id ?? nextNotificationId++,
        } as AppNotification;
        notificationStore.set(saved.id, saved);
        return saved;
      }),
      findOneOrFail: jest.fn(async ({ where }: { where: { id: number } }) => {
        const found = notificationStore.get(where.id);
        if (!found) throw new Error('not found');
        return {
          ...found,
          sender_company_user: null,
          receiver_company_user: receiver,
        };
      }),
      update: jest.fn(async (id: number, patch: Partial<AppNotification>) => {
        const found = notificationStore.get(id);
        if (found) Object.assign(found, patch);
      }),
      count: jest.fn().mockResolvedValue(0),
    };

    const companyUserRepository = {
      findOne: jest.fn().mockResolvedValue(receiver),
    };

    const deliveryStore = new Map<number, NotificationDelivery>();
    let nextDeliveryId = 1;
    const deliveryRepository = {
      create: jest.fn(
        (input: Partial<NotificationDelivery>) =>
          ({ ...input }) as NotificationDelivery,
      ),
      save: jest.fn(async (entity: NotificationDelivery) => {
        const saved = {
          ...entity,
          id: entity.id ?? nextDeliveryId++,
        } as NotificationDelivery;
        deliveryStore.set(saved.id, saved);
        return saved;
      }),
      find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        Array.from(deliveryStore.values()).filter((delivery) => {
          if (
            where.notificationId !== undefined &&
            delivery.notificationId !== where.notificationId
          ) {
            return false;
          }
          if (where.status !== undefined && delivery.status !== where.status) {
            return false;
          }
          return true;
        }),
      ),
      findOne: jest.fn(async ({ where }: { where: { id: number } }) => {
        const found = deliveryStore.get(where.id);
        if (!found) return null;
        return {
          ...found,
          notification: {
            ...notificationStore.get(found.notificationId)!,
            receiver_company_user: receiver,
          },
        };
      }),
    };

    const outboxStore = new Map<number, NotificationOutboxEvent>();
    let nextOutboxId = 1;
    const outboxRepository = {
      create: jest.fn(
        (input: Partial<NotificationOutboxEvent>) =>
          ({
            status: 'PENDING',
            attemptCount: 0,
            ...input,
          }) as NotificationOutboxEvent,
      ),
      save: jest.fn(async (entity: NotificationOutboxEvent) => {
        const saved = {
          ...entity,
          id: entity.id ?? nextOutboxId++,
        } as NotificationOutboxEvent;
        outboxStore.set(saved.id, saved);
        return saved;
      }),
      find: jest.fn(async ({ where }: { where: { status: string } }) =>
        Array.from(outboxStore.values()).filter(
          (event) => event.status === where.status,
        ),
      ),
      findOneOrFail: jest.fn(async ({ where }: { where: { id: number } }) => {
        const found = outboxStore.get(where.id);
        if (!found) throw new Error('not found');
        return found;
      }),
      update: jest.fn(
        async (id: number, patch: Partial<NotificationOutboxEvent>) => {
          const found = outboxStore.get(id);
          if (found) Object.assign(found, patch);
        },
      ),
      createQueryBuilder: jest.fn(() =>
        buildQueryBuilder({
          getOne: jest.fn(() => Promise.resolve(outboxStore.get(1) ?? null)),
        }),
      ),
    };

    const gateway = {
      emitToCompanyUser: jest.fn(),
      emitUnreadCount: jest.fn(),
    } as unknown as NotificationsGateway;

    const preferencesService = {
      filterEnabledChannels: jest.fn(
        async (
          _id: number,
          _type: NotificationTypeEnum,
          channels: NotificationChannelEnum[],
        ) => channels,
      ),
    } as unknown as NotificationPreferencesService;
    const notificationQueueService = {
      enqueueOutboxEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationQueueService;

    const orchestrator = new NotificationOrchestratorService(
      notificationRepository as unknown as Repository<AppNotification>,
      companyUserRepository as unknown as Repository<CompanyUser>,
      deliveryRepository as unknown as Repository<NotificationDelivery>,
      outboxRepository as unknown as Repository<NotificationOutboxEvent>,
      gateway,
      preferencesService,
      notificationChannelManagementService,
      notificationQueueService,
    );

    await orchestrator.create({
      company_id: companyId,
      receiver_company_user_id: receiverCompanyUserId,
      type: NotificationTypeEnum.GENERAL,
      title: 'SMS only',
      message: 'Payroll ready for review.',
      channels: [NotificationChannelEnum.SMS],
    });

    const smsDelivery = Array.from(deliveryStore.values()).find(
      (delivery) => delivery.channel === NotificationChannelEnum.SMS,
    );

    expect(smsDelivery).toBeDefined();
    expect(smsDelivery!.status).toBe(NotificationDeliveryStatusEnum.PENDING);
    expect(smsDelivery!.recipientAddress).toBe('+255754000111');
    expect(gateway.emitToCompanyUser).not.toHaveBeenCalled();
    expect(preferencesService.filterEnabledChannels).toHaveBeenCalledWith(
      receiverCompanyUserId,
      NotificationTypeEnum.GENERAL,
      [NotificationChannelEnum.SMS],
    );

    const outboxEvent = Array.from(outboxStore.values())[0];

    outboxRepository.createQueryBuilder.mockImplementation(() =>
      buildQueryBuilder({
        getOne: jest.fn(() =>
          Promise.resolve(outboxStore.get(outboxEvent.id) ?? null),
        ),
      }),
    );

    const dataSource = {
      transaction: jest.fn(
        (callback: (manager: EntityManager) => Promise<unknown>) => {
          const manager = {
            getRepository: jest.fn(() => outboxRepository),
          } as unknown as EntityManager;
          return callback(manager);
        },
      ),
    } as unknown as DataSource;

    const mailService = {
      sendGenericNotificationEmail: jest.fn(),
    } as unknown as MailService;
    const smsService = {
      isConfigured: jest.fn().mockReturnValue(true),
      getConfigurationError: jest.fn().mockReturnValue(null),
      sendGenericNotificationSms: jest
        .fn()
        .mockResolvedValue({ providerCode: '200' }),
    } as unknown as SmsService;

    const dispatcher = new NotificationDeliveryDispatcherService(
      dataSource,
      outboxRepository as unknown as Repository<NotificationOutboxEvent>,
      deliveryRepository as unknown as Repository<NotificationDelivery>,
      notificationRepository as unknown as Repository<AppNotification>,
      {
        runWithLock: jest.fn(
          async (_key: string, callback: () => Promise<unknown>) => ({
            acquired: true,
            result: await callback(),
          }),
        ),
      } as never,
      mailService,
      smsService,
      gateway,
      notificationChannelManagementService,
    );

    await dispatcher.dispatch();

    expect(smsService.sendGenericNotificationSms).toHaveBeenCalledWith(
      '+255754000111',
      'SMS only',
      'Payroll ready for review.',
      null,
    );

    const deliveredSms = deliveryStore.get(smsDelivery!.id);
    expect(deliveredSms!.status).toBe(NotificationDeliveryStatusEnum.DELIVERED);
    expect(deliveredSms!.recipientAddress).toBe('+255754000111');
    expect(outboxStore.get(outboxEvent.id)!.status).toBe('PROCESSED');
  });

  it('marks unsupported PUSH delivery requests as skipped before dispatch', async () => {
    const companyId = 6;
    const receiverCompanyUserId = 10;

    const receiver = {
      id: receiverCompanyUserId,
      company_id: companyId,
      user: {
        email: 'receiver@example.com',
        phone: '+255754000222',
        first_name: 'Rita',
        last_name: 'Receiver',
      },
    } as unknown as CompanyUser;

    const notificationStore = new Map<number, AppNotification>();
    let nextNotificationId = 1;
    const notificationRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(
        (input: Partial<AppNotification>) => input as AppNotification,
      ),
      save: jest.fn(async (entity: AppNotification) => {
        const saved = {
          ...entity,
          id: entity.id ?? nextNotificationId++,
        } as AppNotification;
        notificationStore.set(saved.id, saved);
        return saved;
      }),
      findOneOrFail: jest.fn(async ({ where }: { where: { id: number } }) => {
        const found = notificationStore.get(where.id);
        if (!found) throw new Error('not found');
        return {
          ...found,
          sender_company_user: null,
          receiver_company_user: receiver,
        };
      }),
      update: jest.fn(async (id: number, patch: Partial<AppNotification>) => {
        const found = notificationStore.get(id);
        if (found) Object.assign(found, patch);
      }),
      count: jest.fn().mockResolvedValue(0),
    };

    const companyUserRepository = {
      findOne: jest.fn().mockResolvedValue(receiver),
    };

    const deliveryStore = new Map<number, NotificationDelivery>();
    let nextDeliveryId = 1;
    const deliveryRepository = {
      create: jest.fn(
        (input: Partial<NotificationDelivery>) =>
          ({ ...input }) as NotificationDelivery,
      ),
      save: jest.fn(async (entity: NotificationDelivery) => {
        const saved = {
          ...entity,
          id: entity.id ?? nextDeliveryId++,
        } as NotificationDelivery;
        deliveryStore.set(saved.id, saved);
        return saved;
      }),
    };

    const outboxRepository = {
      create: jest.fn(
        (input: Partial<NotificationOutboxEvent>) =>
          ({
            status: 'PENDING',
            attemptCount: 0,
            ...input,
          }) as NotificationOutboxEvent,
      ),
      save: jest.fn(async (entity: NotificationOutboxEvent) => entity),
    };

    const gateway = {
      emitToCompanyUser: jest.fn(),
      emitUnreadCount: jest.fn(),
    } as unknown as NotificationsGateway;

    const preferencesService = {
      filterEnabledChannels: jest.fn(
        async (
          _id: number,
          _type: NotificationTypeEnum,
          channels: NotificationChannelEnum[],
        ) => channels,
      ),
    } as unknown as NotificationPreferencesService;
    const notificationQueueService = {
      enqueueOutboxEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationQueueService;

    const orchestrator = new NotificationOrchestratorService(
      notificationRepository as unknown as Repository<AppNotification>,
      companyUserRepository as unknown as Repository<CompanyUser>,
      deliveryRepository as unknown as Repository<NotificationDelivery>,
      outboxRepository as unknown as Repository<NotificationOutboxEvent>,
      gateway,
      preferencesService,
      notificationChannelManagementService,
      notificationQueueService,
    );

    await orchestrator.create({
      company_id: companyId,
      receiver_company_user_id: receiverCompanyUserId,
      type: NotificationTypeEnum.GENERAL,
      title: 'Push only',
      message: 'This deployment does not support PUSH.',
      channels: [NotificationChannelEnum.PUSH],
    });

    const pushDelivery = Array.from(deliveryStore.values()).find(
      (delivery) => delivery.channel === NotificationChannelEnum.PUSH,
    );

    expect(pushDelivery).toBeDefined();
    expect(pushDelivery!.status).toBe(NotificationDeliveryStatusEnum.SKIPPED);
    expect(pushDelivery!.lastError).toBe(
      unsupportedNotificationChannelMessage(NotificationChannelEnum.PUSH),
    );
  });
});
