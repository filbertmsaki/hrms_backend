import { IsEnum, IsOptional, IsString } from 'class-validator';
import { NotificationChannelEnum } from '../enums/notification-channel.enum';

export class NotificationChannelRegistryQueryDto {
  @IsOptional()
  @IsEnum(NotificationChannelEnum)
  channel?: NotificationChannelEnum;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
