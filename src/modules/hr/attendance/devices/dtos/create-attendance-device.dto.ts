import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsIP,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AttendanceDeviceStatusEnum } from '../enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../enums/attendance-device-sync-mode.enum';

export class CreateAttendanceDeviceDto {
  @IsString()
  @MaxLength(150)
  device_name: string;

  @IsString()
  @MaxLength(100)
  device_code: string;

  @IsString()
  @MaxLength(150)
  device_serial_number: string;

  @IsString()
  @MaxLength(120)
  device_model: string;

  @IsIP()
  ip_address: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  port: number;

  @IsString()
  @MaxLength(20)
  protocol: string;

  @IsString()
  @MaxLength(120)
  api_username: string;

  @IsString()
  api_password: string;

  @ApiPropertyOptional({ enum: AttendanceDeviceSyncModeEnum })
  @IsEnum(AttendanceDeviceSyncModeEnum)
  @IsOptional()
  sync_mode?: AttendanceDeviceSyncModeEnum;

  @ApiPropertyOptional({ enum: AttendanceDeviceStatusEnum })
  @IsEnum(AttendanceDeviceStatusEnum)
  @IsOptional()
  status?: AttendanceDeviceStatusEnum;

  @IsString()
  @MaxLength(100)
  timezone: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(255)
  @IsOptional()
  location_description?: string;

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}




