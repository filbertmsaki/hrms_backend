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
  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(150)
  @IsOptional()
  device_name?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  device_code?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(150)
  @IsOptional()
  device_serial_number?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  device_model?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsIP()
  @IsOptional()
  ip_address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  port?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  protocol?: string | null;

  @ApiPropertyOptional({ example: 'Hikvision' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  vendor_name?: string;

  @ApiPropertyOptional({ example: 'hikvision' })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  integration_type?: string;

  @ApiPropertyOptional({ example: 'digest', nullable: true })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  auth_type?: string | null;

  @IsString()
  @MaxLength(120)
  api_username: string;

  @IsString()
  api_password: string;

  @ApiPropertyOptional({ enum: AttendanceDeviceSyncModeEnum })
  @IsEnum(AttendanceDeviceSyncModeEnum)
  @IsOptional()
  sync_mode?: AttendanceDeviceSyncModeEnum;

  @ApiPropertyOptional({ enum: AttendanceDeviceStatusEnum, nullable: true })
  @IsEnum(AttendanceDeviceStatusEnum)
  @IsOptional()
  status?: AttendanceDeviceStatusEnum | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  timezone?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  firmware_version?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  mac_address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  device_type?: string | null;

  @ApiPropertyOptional({ nullable: true })
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




