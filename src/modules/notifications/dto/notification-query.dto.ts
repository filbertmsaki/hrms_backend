import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { NotificationCategoryEnum } from '../enums/notification-category.enum';
import { NotificationPriorityEnum } from '../enums/notification-priority.enum';
import { NotificationStatusEnum } from '../enums/notification-status.enum';

export class NotificationQueryDto extends PaginationDto {
  @IsEnum(NotificationStatusEnum)
  @IsOptional()
  status?: NotificationStatusEnum;

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

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() === 'true' : value,
  )
  @IsBoolean()
  @IsOptional()
  seen?: boolean;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() === 'true' : value,
  )
  @IsBoolean()
  @IsOptional()
  include_archived?: boolean;
}
