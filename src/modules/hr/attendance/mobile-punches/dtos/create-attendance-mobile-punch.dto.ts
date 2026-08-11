import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsIP,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Matches,
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
  @ApiProperty({
    example: '01c21917-8762-4a66-b75b-049c09fb5660',
    description:
      'A unique request ID generated once by the mobile application. Retrying the same request must reuse this value.',
  })
  @IsUUID()
  clientRequestId: string;

  @ApiPropertyOptional({
    example: '2026-08-03T08:15:00.000Z',
    description:
      'Time reported by the mobile device. The server time remains authoritative.',
  })
  @IsOptional()
  @IsDateString()
  clientCapturedAt?: string;

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
  @MaxLength(255)
  @Matches(/\S/, {
    message: 'wifiSsid should not be empty',
  })
  wifiSsid?: string;

  @ApiPropertyOptional({ example: 'AA:BB:CC:DD:EE:FF' })
  @IsOptional()
  @IsString()
  @Matches(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/, {
    message:
      'wifiBssid must be a valid MAC address in the format AA:BB:CC:DD:EE:FF',
  })
  wifiBssid?: string;

  @ApiPropertyOptional({ example: '10.40.1.24' })
  @IsOptional()
  @IsIP(4, {
    message: 'ipAddress must be a valid IPv4 address',
  })
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
