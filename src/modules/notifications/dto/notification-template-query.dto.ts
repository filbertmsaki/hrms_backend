import { IsEnum, IsOptional, IsString } from 'class-validator';
import { NotificationTemplateStatusEnum } from '../enums/notification-template-status.enum';

export class NotificationTemplateQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  template_code?: string;

  @IsOptional()
  @IsEnum(NotificationTemplateStatusEnum)
  status?: NotificationTemplateStatusEnum;
}
