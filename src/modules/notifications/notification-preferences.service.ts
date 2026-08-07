import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { NotificationPreference } from './entities/notification-preference.entity';
import {
  isNotificationChannelSupported,
  unsupportedNotificationChannelMessage,
} from './notification-channel-policy';

export const MANDATORY_NOTIFICATION_TYPES: ReadonlySet<NotificationTypeEnum> =
  new Set<NotificationTypeEnum>([
    NotificationTypeEnum.AUTH_SECURITY,
    NotificationTypeEnum.ACCESS_CHANGE,
    NotificationTypeEnum.SYSTEM_ALERT,
  ]);

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
  ) {}

  async findMine(companyMembershipId: number) {
    const preferences = await this.preferenceRepository.find({
      where: { companyMembershipId },
      order: { notificationType: 'ASC', channel: 'ASC' },
    });

    return preferences.filter((preference) =>
      isNotificationChannelSupported(preference.channel),
    );
  }

  async setPreference(
    companyMembershipId: number,
    notificationType: NotificationTypeEnum,
    channel: NotificationChannelEnum,
    isEnabled: boolean,
  ) {
    if (!isNotificationChannelSupported(channel)) {
      throw new BadRequestException(
        unsupportedNotificationChannelMessage(channel),
      );
    }

    if (
      !isEnabled &&
      MANDATORY_NOTIFICATION_TYPES.has(notificationType) &&
      channel === NotificationChannelEnum.IN_APP
    ) {
      throw new BadRequestException(
        `Notification type ${notificationType} cannot be disabled for the in-app channel`,
      );
    }

    let preference = await this.preferenceRepository.findOne({
      where: { companyMembershipId, notificationType, channel },
    });

    if (!preference) {
      preference = this.preferenceRepository.create({
        companyMembershipId,
        notificationType,
        channel,
        isEnabled,
      });
    } else {
      preference.isEnabled = isEnabled;
    }

    return this.preferenceRepository.save(preference);
  }

  async filterEnabledChannels(
    companyMembershipId: number,
    notificationType: NotificationTypeEnum,
    channels: NotificationChannelEnum[],
  ): Promise<NotificationChannelEnum[]> {
    if (!channels.length) {
      return channels;
    }

    const supportedChannels = channels.filter(isNotificationChannelSupported);

    if (!supportedChannels.length) {
      return supportedChannels;
    }

    const preferences = await this.preferenceRepository.find({
      where: { companyMembershipId, notificationType },
    });

    const disabled = new Set(
      preferences
        .filter((preference) => !preference.isEnabled)
        .map((preference) => preference.channel),
    );

    return supportedChannels.filter(
      (channel) =>
        MANDATORY_NOTIFICATION_TYPES.has(notificationType) ||
        !disabled.has(channel),
    );
  }
}
