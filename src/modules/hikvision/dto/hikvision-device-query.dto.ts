import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AttendanceDeviceStatusEnum } from '../../access-control/attendance-devices/enums/attendance-device-status.enum';

export class HikvisionDeviceQueryDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional({ enum: AttendanceDeviceStatusEnum })
  @IsEnum(AttendanceDeviceStatusEnum)
  @IsOptional()
  status?: AttendanceDeviceStatusEnum;

  @ApiPropertyOptional({
    description: 'Search by device name, code, serial or IP address',
  })
  @IsString()
  @IsOptional()
  search?: string;
}
