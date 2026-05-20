import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AttendanceCheckpointStatusEnum } from '../enums/attendance-checkpoint-status.enum';
import { AttendanceCheckpointTypeEnum } from '../enums/attendance-checkpoint-type.enum';

export class CreateAttendanceCheckpointDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  policy_set_id: number;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsEnum(AttendanceCheckpointTypeEnum)
  type: AttendanceCheckpointTypeEnum;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  geofence_id?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(255)
  @IsOptional()
  wifi_ssid?: string;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_required?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_override?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  max_distance_meters?: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  strict_mode?: boolean;

  @ApiPropertyOptional({ enum: AttendanceCheckpointStatusEnum })
  @IsEnum(AttendanceCheckpointStatusEnum)
  @IsOptional()
  status?: AttendanceCheckpointStatusEnum;
}




