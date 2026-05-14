import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OffboardingTypeEnum } from '../enums/offboarding-type.enum';

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
  metadata?: Record<string, unknown>;
}
