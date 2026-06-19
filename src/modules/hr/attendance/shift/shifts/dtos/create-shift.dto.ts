import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ShiftStatusEnum } from '../enums/shift-status.enum';
import { ShiftTypeEnum } from '../enums/shift-type.enum';

export class CreateShiftDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  department_id?: number | null;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  @MaxLength(50)
  code: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ShiftTypeEnum)
  shift_type: ShiftTypeEnum;

  @IsString()
  @MaxLength(8)
  start_time: string;

  @IsString()
  @MaxLength(8)
  end_time: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expected_work_minutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimum_work_minutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  half_day_minutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  grace_in_minutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  grace_out_minutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  late_after_minutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  half_day_after_minutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  absent_after_minutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  early_leave_after_minutes?: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_night_shift?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  crosses_midnight?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_overtime?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  max_overtime_minutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  overtime_start_after_minutes?: number;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  overtime_rate_multiplier?: number;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  weekend_multiplier?: number;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  holiday_multiplier?: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  overtime_requires_approval?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  overtime_auto_calculate?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  requires_checkout?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_early_checkin?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_late_checkout?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_multiple_checkin?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  auto_mark_absent?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_mobile_attendance?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_remote_attendance?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  require_geofence?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  require_biometric?: boolean;

  @ApiPropertyOptional({ enum: ShiftStatusEnum })
  @IsEnum(ShiftStatusEnum)
  @IsOptional()
  status?: ShiftStatusEnum;
}
