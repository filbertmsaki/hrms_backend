import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { LeaveAccrualMethodEnum } from '../enums/leave-accrual-method.enum';
import { LeaveDayTreatmentEnum } from '../enums/leave-day-treatment.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeavePolicyTypeInputDto } from './leave-policy-type-input.dto';

export class CreateLeavePolicyDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  applicable_branch_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  applicable_department_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  applicable_position_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  applicable_grade_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  applicable_employment_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  applicable_confirmation_status?: string;

  @ApiPropertyOptional({ enum: LeaveAccrualMethodEnum, default: 'yearly' })
  @IsEnum(LeaveAccrualMethodEnum)
  @IsOptional()
  accrual_method?: LeaveAccrualMethodEnum;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  accrual_rate?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  max_consecutive_days?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  min_service_months?: number;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_during_probation?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_negative_balance?: boolean;

  @ApiPropertyOptional({
    enum: LeaveDayTreatmentEnum,
    default: LeaveDayTreatmentEnum.EMPLOYEE_SCHEDULE,
  })
  @IsEnum(LeaveDayTreatmentEnum)
  @IsOptional()
  weekly_off_treatment?: LeaveDayTreatmentEnum;

  @ApiPropertyOptional({
    enum: LeaveDayTreatmentEnum,
    default: LeaveDayTreatmentEnum.EXCLUDE,
  })
  @IsEnum(LeaveDayTreatmentEnum)
  @IsOptional()
  holiday_treatment?: LeaveDayTreatmentEnum;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_half_day?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_short_leave?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  minimum_short_leave_minutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maximum_short_leave_minutes?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  minimum_notice_days?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  maximum_backdate_days?: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  cancellation_requires_approval?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  cancellation_cutoff_days?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  maximum_accumulation_days?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  attendance_balance_deduction_enabled?: boolean;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  absent_day_deduction_days?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  unpaid_leave_day_deduction_days?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  half_day_deduction_days?: number;

  @ApiPropertyOptional({ enum: LeaveRecordStatusEnum, default: 'active' })
  @IsEnum(LeaveRecordStatusEnum)
  @IsOptional()
  status?: LeaveRecordStatusEnum;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LeavePolicyTypeInputDto)
  leave_types: LeavePolicyTypeInputDto[];

  @ApiPropertyOptional({
    enum: ['calendar', 'anniversary', 'custom'],
    default: 'calendar',
  })
  @IsIn(['calendar', 'anniversary', 'custom'])
  @IsOptional()
  leave_year_type?: 'calendar' | 'anniversary' | 'custom';

  @ValidateIf((dto: CreateLeavePolicyDto) => dto.leave_year_type === 'custom')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  leave_year_start_month?: number | null;

  @ValidateIf((dto: CreateLeavePolicyDto) => dto.leave_year_type === 'custom')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  leave_year_start_day?: number | null;

  @ApiPropertyOptional({
    enum: ['manual_approval', 'automatic'],
    default: 'manual_approval',
  })
  @IsIn(['manual_approval', 'automatic'])
  @IsOptional()
  rollover_execution_mode?: 'manual_approval' | 'automatic';

  @ApiPropertyOptional({
    description:
      'Date this version takes effect (YYYY-MM-DD). Defaults to today for changes to an active policy.',
  })
  @IsDateString()
  @IsOptional()
  effective_from?: string;

  @ApiPropertyOptional({ description: 'Why the policy is being changed.' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  change_reason?: string;

  @ApiPropertyOptional({
    description:
      'Save the change as a draft version instead of submitting it for approval.',
  })
  @IsBoolean()
  @IsOptional()
  save_as_draft?: boolean;
}
