import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { NotificationStatusEnum } from '../enums/notification-status.enum';

export class NotificationQueryDto extends PaginationDto {
  @IsEnum(NotificationStatusEnum)
  @IsOptional()
  status?: NotificationStatusEnum;

  @IsString()
  @IsOptional()
  type?: string;
}
