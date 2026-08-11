import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OffboardingTypeEnum } from '../enums/offboarding-type.enum';
import { OffboardingAccessTerminationModeEnum } from '../enums/offboarding-access-termination-mode.enum';

export class CreateOffboardingRequestDto {
  @Type(() => Number)
  @IsInt()
  employee_id: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  branch_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  department_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  workflow_id?: number;

  @IsString()
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsEnum(OffboardingTypeEnum)
  offboarding_type: OffboardingTypeEnum;

  @IsString()
  @MaxLength(3000)
  reason: string;

  @IsOptional()
  @IsDateString()
  notice_date?: string;

  @IsDateString()
  last_working_date: string;

  @IsEnum(OffboardingAccessTerminationModeEnum)
  @IsOptional()
  access_termination_mode?: OffboardingAccessTerminationModeEnum;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  notice_period_waived?: boolean;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notice_period_waiver_reason?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  submit?: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
