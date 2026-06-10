import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { AttendanceGeofenceStatusEnum } from '../enums/attendance-geofence-status.enum';
import { AttendanceGeofenceTypeEnum } from '../enums/attendance-geofence-type.enum';

export class CreateAttendanceGeofenceDto {
  @IsOptional()
  @IsInt()
  branchId?: number;

  @IsString()
  @IsNotEmpty()
  name: string = '';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(AttendanceGeofenceTypeEnum)
  type?: AttendanceGeofenceTypeEnum;

  @ValidateIf((o) => !o.type || o.type === AttendanceGeofenceTypeEnum.CIRCLE)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf((o) => !o.type || o.type === AttendanceGeofenceTypeEnum.CIRCLE)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ValidateIf((o) => !o.type || o.type === AttendanceGeofenceTypeEnum.CIRCLE)
  @IsInt()
  @Min(5)
  radiusMeters?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  allowedAccuracyMeters?: number;

  @IsOptional()
  @IsBoolean()
  strictAccuracy?: boolean;

  @ValidateIf((o) => o.type === AttendanceGeofenceTypeEnum.POLYGON)
  @IsArray()
  polygonCoordinates?: Array<{
    latitude: number;
    longitude: number;
  }>;

  @IsOptional()
  @IsEnum(AttendanceGeofenceStatusEnum)
  status?: AttendanceGeofenceStatusEnum;
}