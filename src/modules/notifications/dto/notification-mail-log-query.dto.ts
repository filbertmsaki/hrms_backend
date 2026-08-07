import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { NotificationMailLogStatusEnum } from '../enums/notification-mail-log-status.enum';

export class NotificationMailLogQueryDto extends PaginationDto {
  @IsEnum(NotificationMailLogStatusEnum)
  @IsOptional()
  status?: NotificationMailLogStatusEnum;

  @IsString()
  @IsOptional()
  method?: string;

  @IsString()
  @IsOptional()
  recipient_email?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  company_id?: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() === 'true' : value,
  )
  @IsBoolean()
  @IsOptional()
  only_unscoped?: boolean;
}
