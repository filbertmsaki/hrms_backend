import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsString,
  Max,
  Matches,
  Min,
  MaxLength,
} from 'class-validator';
import { AttendanceDailyStatusEnum } from '../../processing/enums/attendance-daily-status.enum';
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

  @ApiPropertyOptional({
    nullable: true,
    minimum: 0,
    maximum: 365,
    description:
      'Maximum age in calendar days of a date that can be regularized; null disables the limit.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  @IsOptional()
  regularization_backdate_days?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 1,
    maximum: 31,
    description:
      'Maximum correction requests submitted for dates in one calendar month; null disables the limit.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  regularization_monthly_request_limit?: number | null;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  regularization_reason_required?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  regularization_evidence_required?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: [String],
    description:
      'Attendance statuses allowed for regularization; null leaves eligibility unrestricted. NO_SUMMARY covers dates without a daily summary.',
  })
  @IsArray()
  @IsIn([...Object.values(AttendanceDailyStatusEnum), 'NO_SUMMARY'], {
    each: true,
  })
  @IsOptional()
  regularization_eligible_statuses?: string[] | null;

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

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_location_exception_override?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  require_selfie_for_check_in?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  require_selfie_for_check_out?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  prevent_mobile_device_sharing?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_offline_punches?: boolean;

  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 72 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(72)
  @IsOptional()
  offline_max_age_hours?: number;

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
