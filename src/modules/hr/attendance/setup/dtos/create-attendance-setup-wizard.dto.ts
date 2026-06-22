import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateAttendancePolicyDto } from '../../policies/dtos/create-attendance-policy.dto';
import { CreateAttendanceGeofenceDto } from '../../geofences/dtos/create-attendance-geofence.dto';
import { CreateAttendanceWifiNetworkDto } from '../../wifi-networks/dtos/create-attendance-wifi-network.dto';
import { CreateHolidayGroupDto } from '../../holidays/dtos/create-holiday-group.dto';
import { AttendanceCheckpointTypeEnum } from '../../checkpoints/enums/attendance-checkpoint-type.enum';
import { AttendanceCheckpointStatusEnum } from '../../checkpoints/enums/attendance-checkpoint-status.enum';

export class AttendanceSetupWizardCheckpointDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsEnum(AttendanceCheckpointTypeEnum)
  type: AttendanceCheckpointTypeEnum;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  geofence_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  wifi_network_id?: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_required?: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_override?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  max_distance_meters?: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  strict_mode?: boolean;

  @IsEnum(AttendanceCheckpointStatusEnum)
  @IsOptional()
  status?: AttendanceCheckpointStatusEnum;
}

export class CreateAttendanceSetupWizardDto {
  @ValidateNested()
  @Type(() => CreateAttendancePolicyDto)
  policy: CreateAttendancePolicyDto;

  @ValidateNested()
  @Type(() => CreateAttendanceGeofenceDto)
  @IsOptional()
  geofence?: CreateAttendanceGeofenceDto;

  @ValidateNested()
  @Type(() => CreateAttendanceWifiNetworkDto)
  @IsOptional()
  wifiNetwork?: CreateAttendanceWifiNetworkDto;

  @ValidateNested()
  @Type(() => CreateHolidayGroupDto)
  @IsOptional()
  holidayGroup?: CreateHolidayGroupDto;

  @ValidateNested({ each: true })
  @Type(() => AttendanceSetupWizardCheckpointDto)
  @IsArray()
  @IsOptional()
  checkpoints?: AttendanceSetupWizardCheckpointDto[];

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  autoCreateGpsCheckpoint?: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  autoCreateWifiCheckpoint?: boolean;
}