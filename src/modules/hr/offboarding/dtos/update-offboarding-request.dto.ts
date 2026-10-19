import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { OffboardingTypeEnum } from '../enums/offboarding-type.enum';
import { OffboardingAccessTerminationModeEnum } from '../enums/offboarding-access-termination-mode.enum';

export class UpdateOffboardingRequestDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsOptional()
  @IsEnum(OffboardingTypeEnum)
  offboarding_type?: OffboardingTypeEnum;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  reason?: string;

  @IsOptional()
  @IsDateString()
  notice_date?: string;

  @IsOptional()
  @IsDateString()
  last_working_date?: string;

  @IsOptional()
  @IsBoolean()
  notice_period_waived?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notice_period_waiver_reason?: string;

  @IsOptional()
  @IsEnum(OffboardingAccessTerminationModeEnum)
  access_termination_mode?: OffboardingAccessTerminationModeEnum;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
