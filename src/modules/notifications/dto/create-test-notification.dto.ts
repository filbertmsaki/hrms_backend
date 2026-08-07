import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NotificationCategoryEnum } from '../enums/notification-category.enum';
import { NotificationChannelEnum } from '../enums/notification-channel.enum';
import { NotificationPriorityEnum } from '../enums/notification-priority.enum';

export class CreateTestNotificationDto {
  @IsInt()
  receiver_company_user_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsEnum(NotificationCategoryEnum)
  @IsOptional()
  category?: NotificationCategoryEnum;

  @IsEnum(NotificationPriorityEnum)
  @IsOptional()
  priority?: NotificationPriorityEnum;

  @IsString()
  @IsOptional()
  related_module?: string;

  @IsString()
  @IsOptional()
  entity_type?: string;

  @IsString()
  @IsOptional()
  entity_id?: string;

  @IsString()
  @IsOptional()
  action_url?: string;

  @IsString()
  @IsOptional()
  dedupe_key?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsEnum(NotificationChannelEnum)
  @IsOptional()
  delivery_channel?: NotificationChannelEnum;
}
