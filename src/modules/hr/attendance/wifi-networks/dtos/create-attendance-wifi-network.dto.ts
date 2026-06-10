import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { AttendanceWifiNetworkStatusEnum } from '../enums/attendance-wifi-network-status.enum';
import { AttendanceWifiSecurityTypeEnum } from '../enums/attendance-wifi-security-type.enum';

export class CreateAttendanceWifiNetworkDto {
  @IsOptional()
  @IsInt()
  branchId?: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  ssid: string;

  @IsOptional()
  @IsString()
  bssid?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIpCidrs?: string[];

  @IsOptional()
  @IsEnum(AttendanceWifiSecurityTypeEnum)
  securityType?: AttendanceWifiSecurityTypeEnum;

  @IsOptional()
  @IsBoolean()
  requireSsidMatch?: boolean;

  @IsOptional()
  @IsBoolean()
  requireBssidMatch?: boolean;

  @IsOptional()
  @IsBoolean()
  requireIpMatch?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMobileAttendance?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsEnum(AttendanceWifiNetworkStatusEnum)
  status?: AttendanceWifiNetworkStatusEnum;
}