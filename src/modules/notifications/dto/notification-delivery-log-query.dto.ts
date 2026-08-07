import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { NotificationChannelEnum } from '../enums/notification-channel.enum';
import { NotificationDeliveryStatusEnum } from '../enums/notification-delivery-status.enum';

export class NotificationDeliveryLogQueryDto extends PaginationDto {
  @IsEnum(NotificationChannelEnum)
  @IsOptional()
  channel?: NotificationChannelEnum;

  @IsEnum(NotificationDeliveryStatusEnum)
  @IsOptional()
  status?: NotificationDeliveryStatusEnum;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  notification_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  receiver_company_user_id?: number;

  @IsString()
  @IsOptional()
  related_module?: string;

  @IsString()
  @IsOptional()
  entity_type?: string;

  @IsString()
  @IsOptional()
  entity_id?: string;
}
