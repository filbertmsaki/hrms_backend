import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SmsLogStatusEnum } from '../enums/sms-log-status.enum';

export class SmsLogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(SmsLogStatusEnum)
  status?: SmsLogStatusEnum;

  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  notification_code?: string;
}
