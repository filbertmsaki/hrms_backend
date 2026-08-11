import { IsBoolean } from 'class-validator';

export class UpdateNotificationChannelGlobalSettingDto {
  @IsBoolean()
  is_enabled: boolean;
}
