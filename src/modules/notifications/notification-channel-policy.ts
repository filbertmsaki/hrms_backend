import { NotificationChannelEnum } from './enums/notification-channel.enum';

export const SUPPORTED_NOTIFICATION_CHANNELS: readonly NotificationChannelEnum[] =
  [
    NotificationChannelEnum.IN_APP,
    NotificationChannelEnum.EMAIL,
    NotificationChannelEnum.SMS,
    NotificationChannelEnum.PUSH,
  ];

const supportedNotificationChannelSet = new Set<NotificationChannelEnum>(
  SUPPORTED_NOTIFICATION_CHANNELS,
);

export function isNotificationChannelSupported(
  channel: NotificationChannelEnum,
): boolean {
  return supportedNotificationChannelSet.has(channel);
}

export function partitionNotificationChannels(
  channels: NotificationChannelEnum[],
): {
  supported: NotificationChannelEnum[];
  unsupported: NotificationChannelEnum[];
} {
  const supported: NotificationChannelEnum[] = [];
  const unsupported: NotificationChannelEnum[] = [];
  const seen = new Set<NotificationChannelEnum>();

  for (const channel of channels) {
    if (seen.has(channel)) {
      continue;
    }

    seen.add(channel);

    if (isNotificationChannelSupported(channel)) {
      supported.push(channel);
    } else {
      unsupported.push(channel);
    }
  }

  return { supported, unsupported };
}

export function unsupportedNotificationChannelMessage(
  channel: NotificationChannelEnum,
): string {
  return `Channel ${channel} is not supported in this deployment`;
}
