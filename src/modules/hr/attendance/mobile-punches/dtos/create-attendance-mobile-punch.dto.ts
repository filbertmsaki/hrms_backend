import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateAttendanceMobilePunchDto {
  @IsOptional()
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @IsInt()
  geofenceId?: number;

  @IsOptional()
  @IsInt()
  wifiNetworkId?: number;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @IsNumber()
  accuracyMeters?: number;

  @IsOptional()
  @IsString()
  wifiSsid?: string;

  @IsOptional()
  @IsString()
  wifiBssid?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  deviceIdentifier?: string;

  @IsOptional()
  @IsObject()
  deviceInfo?: Record<string, any>;

  @IsOptional()
  @IsString()
  overrideReason?: string;
}
