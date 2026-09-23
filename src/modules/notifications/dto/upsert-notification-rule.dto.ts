import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { NotificationChannelEnum } from '../enums/notification-channel.enum';
import { NotificationPriorityEnum } from '../enums/notification-priority.enum';

export class UpsertNotificationRuleDto {
  @IsString()
  @MaxLength(80)
  notification_type: string;

  @IsString()
  @MaxLength(120)
  trigger_event: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  related_module?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  reminder_before_minutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  reminder_after_minutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  escalation_after_minutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  repeat_interval_minutes?: number | null;

  @IsString()
  @MaxLength(80)
  recipient_type: string;

  @IsArray()
  @ArrayMaxSize(4)
  @IsEnum(NotificationChannelEnum, { each: true })
  channels: NotificationChannelEnum[];

  @IsOptional()
  @IsEnum(NotificationPriorityEnum)
  priority?: NotificationPriorityEnum;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateNotificationRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  trigger_event?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  related_module?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  reminder_before_minutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  reminder_after_minutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  escalation_after_minutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  repeat_interval_minutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  recipient_type?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsEnum(NotificationChannelEnum, { each: true })
  channels?: NotificationChannelEnum[];

  @IsOptional()
  @IsEnum(NotificationPriorityEnum)
  priority?: NotificationPriorityEnum;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
