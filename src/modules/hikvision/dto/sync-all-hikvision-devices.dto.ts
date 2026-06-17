import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { AttendanceDeviceStatusEnum } from '../../access-control/attendance-devices/enums/attendance-device-status.enum';

export class SyncAllHikvisionDevicesDto {
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
    description: 'If true, continue syncing other devices when one fails',
    default: true,
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  continue_on_error?: boolean;
}
