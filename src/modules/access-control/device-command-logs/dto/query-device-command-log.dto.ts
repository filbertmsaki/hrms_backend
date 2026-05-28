import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { DeviceCommandLogStatusEnum } from '../../../hikvision/device-command-logs/enum/device-command-log-status.enum';
import { DeviceCommandTypeEnum } from '../../../hikvision/device-command-logs/enum/device-command-type.enum';

export class QueryDeviceCommandLogDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  companyId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branchId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  deviceId?: number;

  @IsEnum(DeviceCommandTypeEnum)
  @IsOptional()
  commandType?: DeviceCommandTypeEnum;

  @IsEnum(DeviceCommandLogStatusEnum)
  @IsOptional()
  status?: DeviceCommandLogStatusEnum;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

