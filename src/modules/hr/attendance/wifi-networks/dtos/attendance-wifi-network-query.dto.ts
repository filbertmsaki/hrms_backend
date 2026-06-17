// src/modules/hr/attendance/wifi-networks/dtos/attendance-wifi-network-query.dto.ts

import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceWifiNetworkStatusEnum } from '../enums/attendance-wifi-network-status.enum';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class AttendanceWifiNetworkQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  ssid?: string;

  @IsOptional()
  @IsString()
  bssid?: string;

  @IsOptional()
  @IsEnum(AttendanceWifiNetworkStatusEnum)
  status?: AttendanceWifiNetworkStatusEnum;
}
