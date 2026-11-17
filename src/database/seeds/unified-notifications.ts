import { EntityManager } from 'typeorm';
import { NotificationChannelGlobalSetting } from '../../modules/notifications/entities/notification-channel-global-setting.entity';
import { NotificationChannelRegistry } from '../../modules/notifications/entities/notification-channel-registry.entity';
import {
  CHANNEL_SETTING_DEFAULTS,
  DEFAULT_NOTIFICATION_CHANNEL_REGISTRY,
} from '../../modules/notifications/notification-channel-management.service';

/** Uses the same insert-only catalog as the notification service. */
export async function seedNotifications(manager: EntityManager): Promise<void> {
  await manager
    .getRepository(NotificationChannelGlobalSetting)
    .createQueryBuilder()
    .insert()
    .values([...CHANNEL_SETTING_DEFAULTS])
    .orIgnore()
    .execute();
  await manager
    .getRepository(NotificationChannelRegistry)
    .createQueryBuilder()
    .insert()
    .values([...DEFAULT_NOTIFICATION_CHANNEL_REGISTRY])
    .orIgnore()
    .execute();
}
