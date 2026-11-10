import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EmploymentStatusEnum } from '../enums/employment-status.enum';

export const STATUS_SCHEDULE_MODES = ['shift', 'timetable'] as const;
export type StatusScheduleMode = (typeof STATUS_SCHEDULE_MODES)[number];

export const SUSPENSION_REASONS = [
  'disciplinary',
  'investigation',
  'medical',
  'administrative',
  'other',
] as const;

export const SUSPENSION_PAY_STATUSES = ['paid', 'unpaid', 'partial'] as const;
export type SuspensionPayStatus = (typeof SUSPENSION_PAY_STATUSES)[number];

export const STATUS_EXIT_REASONS = [
  'resignation',
  'termination',
  'end_of_contract',
  'retirement',
  'other',
] as const;
export type StatusExitReason = (typeof STATUS_EXIT_REASONS)[number];

/** Work schedule to assign as part of an activation. */
export class StatusChangeScheduleDto {
  @IsIn(STATUS_SCHEDULE_MODES)
  mode: StatusScheduleMode;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  id: number;

  @ApiPropertyOptional({ description: 'Defaults to the effective date.' })
  @IsDateString()
  @IsOptional()
  effective_from?: string;
}

export class StatusChangeActivationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  leave_policy_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  attendance_policy_id?: number;
}

export class StatusChangeSuspensionDto {
  @IsIn(SUSPENSION_REASONS)
  reason: (typeof SUSPENSION_REASONS)[number];

  @IsDateString()
  @IsOptional()
  start_date?: string;

  @IsDateString()
  @IsOptional()
  expected_end_date?: string | null;

  @IsIn(SUSPENSION_PAY_STATUSES)
  pay_status: SuspensionPayStatus;

  @IsBoolean()
  @IsOptional()
  pause_attendance?: boolean;

  @IsBoolean()
  @IsOptional()
  disable_login?: boolean;

  @IsBoolean()
  @IsOptional()
  notify_manager?: boolean;
}

export class StatusChangeExitDto {
  @IsDateString()
  exit_date: string;

  @IsDateString()
  last_working_day: string;

  @IsIn(STATUS_EXIT_REASONS)
  reason: StatusExitReason;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @IsOptional()
  reason_details?: string;

  @IsBoolean()
  @IsOptional()
  rehire_eligible?: boolean;

  @IsBoolean()
  @IsOptional()
  end_schedule?: boolean;

  @ApiPropertyOptional({
    type: [Number],
    description:
      'Offboarding workflow step ids HR marks as already done; the rest become pending tasks.',
  })
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  completed_step_ids?: number[];
}

export class ChangeEmployeeStatusDto {
  @ApiPropertyOptional({
    enum: EmploymentStatusEnum,
  })
  @IsEnum(EmploymentStatusEnum)
  employment_status: EmploymentStatusEnum;

  @IsDateString()
  effective_date: string;

  @IsDateString()
  @IsOptional()
  exit_date?: string;

  @IsString()
  @IsOptional()
  exit_reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @ValidateNested()
  @Type(() => StatusChangeScheduleDto)
  @IsOptional()
  schedule?: StatusChangeScheduleDto;

  @ValidateNested()
  @Type(() => StatusChangeActivationDto)
  @IsOptional()
  activation?: StatusChangeActivationDto;

  @ValidateNested()
  @Type(() => StatusChangeSuspensionDto)
  @IsOptional()
  suspension?: StatusChangeSuspensionDto;

  @ValidateNested()
  @Type(() => StatusChangeExitDto)
  @IsOptional()
  exit?: StatusChangeExitDto;
}
