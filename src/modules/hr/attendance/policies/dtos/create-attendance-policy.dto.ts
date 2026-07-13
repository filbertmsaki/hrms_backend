import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  MaxLength,
} from 'class-validator';
import { AttendanceHolidayPolicyModeEnum } from '../enums/attendance-holiday-policy-mode.enum';
import { AttendanceRoundingModeEnum } from '../enums/attendance-rounding-mode.enum';

export class CreateAttendancePolicyDto {
  @MaxLength(255)
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  late_after_minutes?: number;

  @ApiPropertyOptional({ default: 240 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  half_day_after_minutes?: number;

  @ApiPropertyOptional({ default: 480 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  absent_after_minutes?: number;

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

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  auto_absent_if_no_checkin?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  requires_manager_approval_for_overtime?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  overtime_start_after_minutes?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  max_overtime_minutes_per_day?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  max_overtime_minutes_per_month?: number;

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
  holiday_overtime_multiplier?: number;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  weekend_overtime_multiplier?: number;

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

  @ApiPropertyOptional({
    enum: AttendanceRoundingModeEnum,
    default: AttendanceRoundingModeEnum.NEAREST,
  })
  @IsEnum(AttendanceRoundingModeEnum)
  @IsOptional()
  rounding_mode?: AttendanceRoundingModeEnum;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  max_missing_punch_allowed?: number;

  @ApiPropertyOptional({ default: 'SAT,SUN' })
  @MaxLength(100)
  @IsString()
  @IsOptional()
  weekend_days?: string;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  auto_mark_weekend_as_off?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  treat_weekend_as_absent_if_scheduled?: boolean;

  @ApiPropertyOptional({
    enum: AttendanceHolidayPolicyModeEnum,
    default: AttendanceHolidayPolicyModeEnum.OFF,
  })
  @IsEnum(AttendanceHolidayPolicyModeEnum)
  @IsOptional()
  holiday_policy_mode?: AttendanceHolidayPolicyModeEnum;

  @ApiPropertyOptional({ default: 'MOBILE_APP,WEB' })
  @MaxLength(120)
  @IsString()
  @IsOptional()
  authentication_modes?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  require_geo_fencing?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_multi_device_login?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  auto_calculate_attendance?: boolean;

  @ApiPropertyOptional({
    default: '23:59:00',
    description: '24-hour time HH:MM or HH:MM:SS',
  })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  @IsOptional()
  calculation_time?: string;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  grace_period_minutes?: number;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  consider_shift_roster?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  ignore_missing_checkout_if_hours_valid?: boolean;
}
