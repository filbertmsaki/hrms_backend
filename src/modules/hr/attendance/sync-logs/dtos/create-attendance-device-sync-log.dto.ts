import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AttendanceDeviceSyncLogStatusEnum } from '../enums/attendance-device-sync-log-status.enum';
import { AttendanceDeviceSyncLogTypeEnum } from '../enums/attendance-device-sync-log-type.enum';

export class CreateAttendanceDeviceSyncLogDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  device_id: number;

  @IsEnum(AttendanceDeviceSyncLogTypeEnum)
  sync_type: AttendanceDeviceSyncLogTypeEnum;

  @IsEnum(AttendanceDeviceSyncLogStatusEnum)
  status: AttendanceDeviceSyncLogStatusEnum;

  @ApiPropertyOptional({ description: 'ISO datetime value' })
  @IsOptional()
  started_at?: string;

  @ApiPropertyOptional({ description: 'ISO datetime value' })
  @IsOptional()
  completed_at?: string;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  records_received?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  records_processed?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  failed_records?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  error_message?: string;
}




