import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class AttendanceMobilePunchDeviceInfoDto {
  @ApiPropertyOptional({ example: 'android' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ example: 'Samsung Galaxy A54' })
  @IsOptional()
  @IsString()
  deviceModel?: string;

  @ApiPropertyOptional({ example: '14' })
  @IsOptional()
  @IsString()
  osVersion?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional({ example: 87 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  batteryLevel?: number;

  @ApiPropertyOptional({ example: 'wifi' })
  @IsOptional()
  @IsString()
  networkType?: string;
}

export class CreateAttendanceMobilePunchDto {
  @ApiPropertyOptional({ example: 39 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @ApiProperty({ example: -6.792354 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 39.208328 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 8.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracyMeters?: number;

  @ApiPropertyOptional({ example: 'Alliance-HQ-Staff' })
  @IsOptional()
  @IsString()
  wifiSsid?: string;

  @ApiPropertyOptional({ example: 'AA:BB:CC:DD:EE:FF' })
  @IsOptional()
  @IsString()
  wifiBssid?: string;

  @ApiPropertyOptional({ example: '10.40.1.24' })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({ example: 'android-SM-A546E-8f3b21c9' })
  @IsOptional()
  @IsString()
  deviceIdentifier?: string;

  @ApiPropertyOptional({
    type: AttendanceMobilePunchDeviceInfoDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AttendanceMobilePunchDeviceInfoDto)
  deviceInfo?: AttendanceMobilePunchDeviceInfoDto;

  @ApiPropertyOptional({
    example: 'Requesting manager review because office WiFi was unavailable.',
  })
  @IsOptional()
  @IsString()
  overrideReason?: string;
}
