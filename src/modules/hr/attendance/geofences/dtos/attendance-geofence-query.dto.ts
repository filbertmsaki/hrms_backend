import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceGeofenceStatusEnum } from '../enums/attendance-geofence-status.enum';
import { AttendanceGeofenceTypeEnum } from '../enums/attendance-geofence-type.enum';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class AttendanceGeofenceQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsEnum(AttendanceGeofenceStatusEnum)
  status?: AttendanceGeofenceStatusEnum;

  @IsOptional()
  @IsEnum(AttendanceGeofenceTypeEnum)
  type?: AttendanceGeofenceTypeEnum;
}
