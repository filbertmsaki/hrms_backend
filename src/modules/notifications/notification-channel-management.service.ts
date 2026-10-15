import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { SecurityEventOutcome } from '../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../security/enums/security-event-type.enum';
import { SecurityEventsService } from '../security/security-events.service';
import { NotificationChannelRegistryQueryDto } from './dto/notification-channel-registry-query.dto';
import { UpdateNotificationChannelGlobalSettingDto } from './dto/update-notification-channel-global-setting.dto';
import { UpdateNotificationChannelRegistryDto } from './dto/update-notification-channel-registry.dto';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { NotificationChannelGlobalSetting } from './entities/notification-channel-global-setting.entity';
import { NotificationChannelRegistry } from './entities/notification-channel-registry.entity';
import { NOTIFICATION_MAIL_METHODS } from './notification-mail-method.constants';

type ChannelRegistrySeed = {
  channel: NotificationChannelEnum;
  code: string;
  name: string;
  module: string;
  description: string;
  isEnabled: boolean;
};

type ChannelSettingSeed = {
  channel: NotificationChannelEnum;
  description: string;
  isEnabled: boolean;
};

const MANAGED_NOTIFICATION_CHANNELS: readonly NotificationChannelEnum[] = [
  NotificationChannelEnum.EMAIL,
  NotificationChannelEnum.IN_APP,
  NotificationChannelEnum.PUSH,
] as const;

const CHANNEL_SETTING_DEFAULTS: readonly ChannelSettingSeed[] = [
  {
    channel: NotificationChannelEnum.EMAIL,
    description:
      'Controls whether automatic email notifications are allowed system-wide.',
    isEnabled: true,
  },
  {
    channel: NotificationChannelEnum.IN_APP,
    description:
      'Controls whether automatic in-app notifications are allowed system-wide.',
    isEnabled: true,
  },
  {
    channel: NotificationChannelEnum.PUSH,
    description:
      'Controls mobile push delivery. Enable only after Expo/EAS credentials and mobile project configuration are ready.',
    isEnabled: false,
  },
] as const;

function humanizeEnumValue(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function resolveNotificationTypeModule(type: NotificationTypeEnum): string {
  if (
    type === NotificationTypeEnum.AUTH_SECURITY ||
    type === NotificationTypeEnum.ACCESS_CHANGE
  ) {
    return 'auth';
  }
  if (type.toString().startsWith('LEAVE_')) {
    return 'leave';
  }
  if (type.toString().startsWith('ONBOARDING_')) {
    return 'onboarding';
  }
  if (type.toString().startsWith('OFFBOARDING_')) {
    return 'offboarding';
  }
  if (type === NotificationTypeEnum.ATTENDANCE_CORRECTION) {
    return 'attendance';
  }
  if (type === NotificationTypeEnum.SYSTEM_ALERT) {
    return 'system';
  }
  return 'notifications';
}

const DEFAULT_NOTIFICATION_CHANNEL_REGISTRY: readonly ChannelRegistrySeed[] = [
  ...NOTIFICATION_MAIL_METHODS.map((method) => ({
    channel: NotificationChannelEnum.EMAIL,
    code: method.code,
    name: method.name,
    module: method.module,
    description: method.description,
    isEnabled: true,
  })),
  ...Object.values(NotificationTypeEnum).flatMap((type) => [
    {
      channel: NotificationChannelEnum.EMAIL,
      code: type,
      name: `${humanizeEnumValue(type)} email notification`,
      module: resolveNotificationTypeModule(type),
      description: `Controls automatic email delivery for ${humanizeEnumValue(type).toLowerCase()} notifications.`,
      isEnabled: true,
    },
    {
      channel: NotificationChannelEnum.IN_APP,
      code: type,
      name: `${humanizeEnumValue(type)} in-app notification`,
      module: resolveNotificationTypeModule(type),
      description: `Controls automatic in-app delivery for ${humanizeEnumValue(type).toLowerCase()} notifications.`,
      isEnabled: true,
    },
    {
      channel: NotificationChannelEnum.PUSH,
      code: type,
      name: `${humanizeEnumValue(type)} push notification`,
      module: resolveNotificationTypeModule(type),
      description: `Controls push delivery for ${humanizeEnumValue(type).toLowerCase()} notifications.`,
      isEnabled: true,
    },
  ]),
] as const;

@Injectable()
export class NotificationChannelManagementService implements OnModuleInit {
  constructor(
    @InjectRepository(NotificationChannelGlobalSetting)
    private readonly globalSettingRepository: Repository<NotificationChannelGlobalSetting>,
    @InjectRepository(NotificationChannelRegistry)
    private readonly registryRepository: Repository<NotificationChannelRegistry>,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaults();
  }

  async listGlobalSettings() {
    await this.ensureDefaults();
    return this.globalSettingRepository.find({
      where: MANAGED_NOTIFICATION_CHANNELS.map((channel) => ({ channel })),
      order: { channel: 'ASC' },
    });
  }

  async getGlobalSetting(channel: NotificationChannelEnum) {
    this.assertManagedChannel(channel);
    await this.ensureDefaults();
    const setting = await this.globalSettingRepository.findOne({
      where: { channel },
    });
    if (!setting) {
      throw new NotFoundException('Notification channel setting not found.');
    }
    return setting;
  }

  async isChannelGloballyEnabled(
    channel: NotificationChannelEnum,
  ): Promise<boolean> {
    const setting = await this.globalSettingRepository.findOne({
      where: { channel },
    });
    return Boolean(setting?.isEnabled);
  }

  async updateGlobalSetting(
    channel: NotificationChannelEnum,
    dto: UpdateNotificationChannelGlobalSettingDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
  ) {
    const setting = await this.getGlobalSetting(channel);
    setting.isEnabled = dto.is_enabled;
    setting.updatedByCompanyUserId = actor.companyMembershipId ?? null;
    const saved = await this.globalSettingRepository.save(setting);

    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.CONFIGURATION_CHANGED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      resourceType: 'notification_channel_global_setting',
      resourceId: channel,
      newValues: { is_enabled: saved.isEnabled },
      context,
    });

    return saved;
  }

  async listRegistry(query: NotificationChannelRegistryQueryDto) {
    await this.ensureDefaults();
    const qb = this.registryRepository.createQueryBuilder('registry');

    if (query.channel) {
      qb.andWhere('registry.channel = :channel', { channel: query.channel });
    }
    if (query.module?.trim()) {
      qb.andWhere('registry.module = :module', { module: query.module.trim() });
    }
    if (query.search?.trim()) {
      qb.andWhere(
        `(
          LOWER(registry.code) LIKE :search OR
          LOWER(registry.name) LIKE :search OR
          LOWER(COALESCE(registry.description, '')) LIKE :search
        )`,
        { search: `%${query.search.trim().toLowerCase()}%` },
      );
    }

    return qb
      .orderBy('registry.channel', 'ASC')
      .addOrderBy('registry.module', 'ASC')
      .addOrderBy('registry.code', 'ASC')
      .getMany();
  }

  async getRegistryItem(channel: NotificationChannelEnum, code: string) {
    this.assertManagedChannel(channel);
    await this.ensureDefaults();
    const item = await this.registryRepository.findOne({
      where: { channel, code },
    });
    if (!item) {
      throw new NotFoundException(
        'Notification channel registry item not found.',
      );
    }
    return item;
  }

  async updateRegistryItem(
    channel: NotificationChannelEnum,
    code: string,
    dto: UpdateNotificationChannelRegistryDto,
    actor: AuthenticatedUser,
    context: AuditRequestContext,
  ) {
    const item = await this.getRegistryItem(channel, code);
    if (dto.is_enabled !== undefined) {
      item.isEnabled = dto.is_enabled;
    }
    if (dto.description !== undefined) {
      item.description = dto.description.trim() || null;
    }
    item.updatedByCompanyUserId = actor.companyMembershipId ?? null;
    const saved = await this.registryRepository.save(item);

    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.CONFIGURATION_CHANGED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      resourceType: 'notification_channel_registry',
      resourceId: `${channel}:${code}`,
      newValues: {
        is_enabled: saved.isEnabled,
        description: saved.description,
      },
      context,
    });

    return saved;
  }

  async resolveEnabledChannels(input: {
    channels: NotificationChannelEnum[];
    notificationType: NotificationTypeEnum;
    eventKey?: string | null;
    templateCode?: string | null;
    relatedModule?: string | null;
  }) {
    const enabledChannels: NotificationChannelEnum[] = [];
    const disabledChannels: Array<{
      channel: NotificationChannelEnum;
      reason: string;
    }> = [];

    for (const channel of input.channels) {
      if (!MANAGED_NOTIFICATION_CHANNELS.includes(channel)) {
        enabledChannels.push(channel);
        continue;
      }

      const code = this.resolveCode(input);
      const verdict = await this.evaluateChannel(channel, code, {
        module:
          input.relatedModule ??
          resolveNotificationTypeModule(input.notificationType),
        name: `${humanizeEnumValue(input.notificationType)} ${channel.toLowerCase()} notification`,
        description: `Auto-generated registry entry for ${input.notificationType} on ${channel}.`,
      });

      if (verdict.enabled) {
        enabledChannels.push(channel);
      } else {
        disabledChannels.push({
          channel,
          reason: verdict.reason ?? 'Notification channel is disabled',
        });
      }
    }

    return { enabledChannels, disabledChannels };
  }

  async evaluateChannel(
    channel: NotificationChannelEnum,
    code: string,
    metadata?: {
      module?: string | null;
      name?: string | null;
      description?: string | null;
    },
  ): Promise<{ enabled: boolean; reason?: string | null }> {
    if (!MANAGED_NOTIFICATION_CHANNELS.includes(channel)) {
      return { enabled: true, reason: null };
    }

    const setting = await this.getGlobalSetting(channel);
    if (!setting.isEnabled) {
      return {
        enabled: false,
        reason: `${channel} notifications are disabled globally`,
      };
    }

    const registryItem = await this.ensureRegistryItem(channel, code, metadata);
    if (!registryItem.isEnabled) {
      return {
        enabled: false,
        reason: `${channel} notification ${code} is disabled`,
      };
    }

    return { enabled: true, reason: null };
  }

  resolveCode(input: {
    notificationType: NotificationTypeEnum;
    eventKey?: string | null;
    templateCode?: string | null;
  }): string {
    return (
      input.eventKey?.trim() ||
      input.templateCode?.trim() ||
      input.notificationType
    );
  }

  resolveDeliveryCode(input: {
    type?: string | null;
    eventKey?: string | null;
    templateCode?: string | null;
  }): string {
    return (
      input.eventKey?.trim() ||
      input.templateCode?.trim() ||
      input.type?.trim() ||
      NotificationTypeEnum.GENERAL
    );
  }

  private assertManagedChannel(channel: NotificationChannelEnum) {
    if (!MANAGED_NOTIFICATION_CHANNELS.includes(channel)) {
      throw new BadRequestException(
        `Notification channel ${channel} is not managed by the channel registry.`,
      );
    }
  }

  private async ensureDefaults(): Promise<void> {
    await this.globalSettingRepository.upsert(
      CHANNEL_SETTING_DEFAULTS.map((item) => ({
        channel: item.channel,
        description: item.description,
        isEnabled: item.isEnabled,
      })),
      ['channel'],
    );

    await this.registryRepository.upsert(
      DEFAULT_NOTIFICATION_CHANNEL_REGISTRY.map((item) => ({
        channel: item.channel,
        code: item.code,
        name: item.name,
        module: item.module,
        description: item.description,
        isEnabled: item.isEnabled,
      })),
      ['channel', 'code'],
    );
  }

  private async ensureRegistryItem(
    channel: NotificationChannelEnum,
    code: string,
    metadata?: {
      module?: string | null;
      name?: string | null;
      description?: string | null;
    },
  ) {
    const item = await this.registryRepository.findOne({
      where: { channel, code },
    });

    if (item) {
      return item;
    }

    await this.registryRepository.upsert(
      {
        channel,
        code,
        name:
          metadata?.name?.trim() ||
          `${humanizeEnumValue(code)} ${channel.toLowerCase()} notification`,
        module: metadata?.module?.trim() || 'notifications',
        description:
          metadata?.description?.trim() ||
          `Auto-generated registry entry for ${code} on ${channel}.`,
        isEnabled: true,
      },
      ['channel', 'code'],
    );

    return this.registryRepository.findOneOrFail({
      where: { channel, code },
    });
  }
}
