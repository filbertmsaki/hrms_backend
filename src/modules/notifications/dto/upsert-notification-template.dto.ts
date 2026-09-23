import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NotificationTemplateStatusEnum } from '../enums/notification-template-status.enum';

export class UpsertNotificationTemplateDto {
  @IsString()
  @MaxLength(120)
  template_code: string;

  @IsString()
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  email_subject?: string | null;

  @IsString()
  @MaxLength(2000)
  system_message: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  email_body?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mobile_message?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  available_variables?: string[];

  @IsOptional()
  @IsEnum(NotificationTemplateStatusEnum)
  status?: NotificationTemplateStatusEnum;
}

export class UpdateNotificationTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  email_subject?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  system_message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  email_body?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mobile_message?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  available_variables?: string[];

  @IsOptional()
  @IsEnum(NotificationTemplateStatusEnum)
  status?: NotificationTemplateStatusEnum;
}
