import { IsBoolean, IsEnum } from 'class-validator';
import { NotificationChannelEnum } from '../../../notifications/enums/notification-channel.enum';
import { NotificationTypeEnum } from '../../../notifications/enums/notification-type.enum';

export class SetMyNotificationPreferenceDto {
  @IsEnum(NotificationTypeEnum)
  notification_type: NotificationTypeEnum;

  @IsEnum(NotificationChannelEnum)
  channel: NotificationChannelEnum;

  @IsBoolean()
  is_enabled: boolean;
}
