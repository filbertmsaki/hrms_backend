import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { DeviceCommandHttpMethodEnum } from '../../../hikvision/device-command-logs/enum/device-command-http-method.enum';
import { DeviceCommandLogStatusEnum } from '../../../hikvision/device-command-logs/enum/device-command-log-status.enum';
import { DeviceCommandTypeEnum } from '../../../hikvision/device-command-logs/enum/device-command-type.enum';

export class CreateDeviceCommandLogDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  company_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;

  @IsEnum(DeviceCommandTypeEnum)
  command_type: DeviceCommandTypeEnum;

  @IsEnum(DeviceCommandHttpMethodEnum)
  http_method: DeviceCommandHttpMethodEnum;

  @IsString()
  @MaxLength(255)
  endpoint: string;

  @IsObject()
  @IsOptional()
  request_body?: Record<string, unknown> | null;

  @IsObject()
  @IsOptional()
  response_body?: Record<string, unknown> | null;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  http_status?: number | null;

  @IsEnum(DeviceCommandLogStatusEnum)
  @IsOptional()
  status?: DeviceCommandLogStatusEnum;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  duration_ms?: number | null;

  @IsString()
  @IsOptional()
  error_message?: string | null;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  correlation_id?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  created_by_company_user_id?: number | null;
}
