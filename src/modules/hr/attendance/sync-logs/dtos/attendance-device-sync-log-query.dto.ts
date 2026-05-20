import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { AttendanceDeviceSyncLogStatusEnum } from '../enums/attendance-device-sync-log-status.enum';
import { AttendanceDeviceSyncLogTypeEnum } from '../enums/attendance-device-sync-log-type.enum';

export class AttendanceDeviceSyncLogQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;

  @ApiPropertyOptional({ enum: AttendanceDeviceSyncLogTypeEnum })
  @IsEnum(AttendanceDeviceSyncLogTypeEnum)
  @IsOptional()
  sync_type?: AttendanceDeviceSyncLogTypeEnum;

  @ApiPropertyOptional({ enum: AttendanceDeviceSyncLogStatusEnum })
  @IsEnum(AttendanceDeviceSyncLogStatusEnum)
  @IsOptional()
  status?: AttendanceDeviceSyncLogStatusEnum;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  to_date?: string;
}





