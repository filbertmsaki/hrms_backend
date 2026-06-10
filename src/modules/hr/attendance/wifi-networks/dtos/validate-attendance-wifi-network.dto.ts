import { IsOptional, IsString } from 'class-validator';

export class ValidateAttendanceWifiNetworkDto {
  @IsOptional()
  @IsString()
  ssid?: string;

  @IsOptional()
  @IsString()
  bssid?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;
}