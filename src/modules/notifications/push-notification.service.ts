import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  RegisterPushDeviceDto,
  UnregisterPushDeviceDto,
} from './dto/register-push-device.dto';
import { PushDevice } from './entities/push-device.entity';
import { AppNotification } from './entities/app-notification.entity';
import { PushReceipt } from './entities/push-receipt.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationDeliveryStatusEnum } from './enums/notification-delivery-status.enum';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(PushDevice)
    private readonly deviceRepository: Repository<PushDevice>,
    @InjectRepository(PushReceipt)
    private readonly receiptRepository: Repository<PushReceipt>,
    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepository: Repository<NotificationDelivery>,
  ) {}

  async register(actor: AuthenticatedUser, dto: RegisterPushDeviceDto) {
    const { companyId, companyUserId } = this.actorScope(actor);
    const token = dto.expo_push_token.trim();
    let device = await this.deviceRepository.findOne({
      where: { expoPushToken: token },
    });
    if (!device)
      device = this.deviceRepository.create({ expoPushToken: token });
    device.companyId = companyId;
    device.companyUserId = companyUserId;
    device.platform = dto.platform;
    device.deviceName = dto.device_name?.trim() || null;
    device.isActive = true;
    device.lastRegisteredAt = new Date();
    device.lastError = null;
    const saved = await this.deviceRepository.save(device);
    return { id: saved.id, platform: saved.platform, registered: true };
  }

  async unregister(actor: AuthenticatedUser, dto: UnregisterPushDeviceDto) {
    const { companyId, companyUserId } = this.actorScope(actor);
    const device = await this.deviceRepository.findOne({
      where: {
        companyId,
        companyUserId,
        expoPushToken: dto.expo_push_token.trim(),
        isActive: true,
      },
    });
    if (!device) throw new NotFoundException('Push device was not found.');
    device.isActive = false;
    device.lastError = 'Unregistered by user';
    await this.deviceRepository.save(device);
    return { id: device.id, registered: false };
  }

  async sendToNotification(notification: AppNotification, deliveryId: number) {
    const devices = await this.deviceRepository.find({
      where: {
        companyId: notification.company_id,
        companyUserId: notification.receiver_company_user_id,
        isActive: true,
      },
      take: 100,
    });
    if (!devices.length)
      throw new Error('Recipient has no registered push devices.');

    const messages = devices.map((device) => ({
      to: device.expoPushToken,
      title: notification.title,
      body: notification.message,
      sound: 'default',
      priority: String(notification.priority) === 'HIGH' ? 'high' : 'default',
      data: {
        notificationId: notification.id,
        actionUrl: notification.action_url ?? null,
        relatedModule: notification.related_module ?? null,
      },
    }));
    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN')?.trim();
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(
        this.config.get<number>('PUSH_GATEWAY_TIMEOUT_MS', 10000),
      ),
    });
    const raw = await response.text();
    let parsed: {
      data?: Array<{
        status?: string;
        id?: string;
        message?: string;
        details?: { error?: string };
      }>;
    };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new ServiceUnavailableException(
        'Expo Push Service returned an invalid response.',
      );
    }
    if (!response.ok || !Array.isArray(parsed.data)) {
      throw new ServiceUnavailableException(
        `Expo Push Service request failed (${response.status}).`,
      );
    }

    const tickets = parsed.data;
    const accepted = tickets.filter((ticket) => ticket.status === 'ok');
    const receiptDrafts: Array<Partial<PushReceipt>> = [];
    for (const [index, ticket] of tickets.entries()) {
      const device = devices[index];
      if (ticket.details?.error === 'DeviceNotRegistered') {
        if (device) {
          device.isActive = false;
          device.lastError = 'DeviceNotRegistered';
          await this.deviceRepository.save(device);
        }
      }
      if (ticket.status === 'ok' && ticket.id && device) {
        receiptDrafts.push({
          ticketId: ticket.id,
          pushDeviceId: device.id,
          notificationDeliveryId: deliveryId,
          status: 'PENDING',
        });
      }
    }
    if (receiptDrafts.length) {
      await this.receiptRepository.save(
        receiptDrafts.map((receipt) => this.receiptRepository.create(receipt)),
      );
    }
    if (!accepted.length) {
      throw new Error(
        tickets.find((ticket) => ticket.message)?.message ??
          'Expo Push Service rejected all devices.',
      );
    }
    return {
      accepted: accepted.length,
      rejected: tickets.length - accepted.length,
      ticketIds: accepted
        .map((ticket) => ticket.id)
        .filter((id): id is string => Boolean(id)),
      deviceTickets: receiptDrafts.map((receipt) => ({
        ticket_id: receipt.ticketId,
        device_id: receipt.pushDeviceId,
      })),
    };
  }

  @Cron('0 */15 * * * *')
  async checkPushReceipts() {
    const now = new Date();
    const dueBefore = new Date(now.getTime() - 15 * 60 * 1000);
    const expireBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await this.receiptRepository.update(
      { status: 'PENDING', createdAt: LessThanOrEqual(expireBefore) },
      {
        status: 'EXPIRED',
        checkedAt: now,
        message: 'Expo receipt expired before it became available.',
      },
    );
    const receipts = await this.receiptRepository.find({
      where: { status: 'PENDING', createdAt: LessThanOrEqual(dueBefore) },
      order: { id: 'ASC' },
      take: 100,
    });
    if (!receipts.length) return;

    try {
      const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN')?.trim();
      const response = await fetch(
        'https://exp.host/--/api/v2/push/getReceipts',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            ids: receipts.map((receipt) => receipt.ticketId),
          }),
          signal: AbortSignal.timeout(
            this.config.get<number>('PUSH_GATEWAY_TIMEOUT_MS', 10000),
          ),
        },
      );
      if (!response.ok)
        throw new Error(`Expo receipt request failed (${response.status}).`);
      const result = (await response.json()) as {
        data?: Record<
          string,
          { status?: string; message?: string; details?: { error?: string } }
        >;
      };
      const providerReceipts = result.data ?? {};
      const deliveryIds = new Set<number>();
      for (const record of receipts) {
        const receipt = providerReceipts[record.ticketId];
        if (!receipt) continue;
        record.status = receipt.status === 'ok' ? 'DELIVERED' : 'FAILED';
        record.message = receipt.message ?? null;
        record.providerError = receipt.details?.error ?? null;
        record.response = receipt as Record<string, unknown>;
        record.checkedAt = new Date();
        await this.receiptRepository.save(record);
        deliveryIds.add(record.notificationDeliveryId);
        if (record.providerError === 'DeviceNotRegistered') {
          await this.deviceRepository.update(
            { id: record.pushDeviceId },
            { isActive: false, lastError: 'DeviceNotRegistered' },
          );
        }
      }
      for (const deliveryId of deliveryIds) {
        const delivery = await this.deliveryRepository.findOne({
          where: { id: deliveryId },
        });
        if (!delivery) continue;
        const relatedReceipts = await this.receiptRepository.find({
          where: { notificationDeliveryId: deliveryId },
        });
        delivery.metadata = {
          ...(delivery.metadata ?? {}),
          expo_receipt_count: relatedReceipts.length,
          expo_receipt_errors: relatedReceipts.filter(
            (receipt) => receipt.status === 'FAILED',
          ).length,
        };
        const receiptsTerminal =
          relatedReceipts.length > 0 &&
          relatedReceipts.every((receipt) =>
            ['DELIVERED', 'FAILED', 'EXPIRED'].includes(receipt.status),
          );
        if (
          receiptsTerminal &&
          relatedReceipts.every((receipt) => receipt.status !== 'DELIVERED')
        ) {
          delivery.status = NotificationDeliveryStatusEnum.FAILED;
          delivery.lastError =
            'Expo could not deliver the push notification to any registered device.';
        }
        await this.deliveryRepository.save(delivery);
      }
    } catch (error) {
      this.logger.warn(
        error instanceof Error
          ? error.message
          : 'Expo push receipt check failed.',
      );
    }
  }

  private actorScope(actor: AuthenticatedUser) {
    const companyId = actor.companyId;
    const companyUserId = actor.companyMembershipId;
    if (!companyId || !companyUserId)
      throw new BadRequestException(
        'Select an active company membership to register a push device.',
      );
    return { companyId, companyUserId };
  }
}
