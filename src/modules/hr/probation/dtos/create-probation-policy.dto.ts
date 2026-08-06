import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EmploymentTypeEnum } from '../../employees/enums/employment-type.enum';

export class ProbationCriterionInputDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(180)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  weight: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  maximum_rating?: number;

  @IsBoolean()
  @IsOptional()
  self_rating_enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  is_required?: boolean;
}

export class CreateProbationPolicyDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(160)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(EmploymentTypeEnum)
  @IsOptional()
  employment_type?: EmploymentTypeEnum;

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
  position_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  grade_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  probation_period_days: number;

  @IsBoolean()
  @IsOptional()
  self_assessment_required?: boolean;

  @IsBoolean()
  @IsOptional()
  objectives_required?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  minimum_confirmation_score?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  maximum_extensions?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  default_extension_days?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maximum_extension_days?: number;

  @IsBoolean()
  @IsOptional()
  manager_review_required?: boolean;

  @IsBoolean()
  @IsOptional()
  hr_approval_required?: boolean;

  @IsBoolean()
  @IsOptional()
  confirmation_letter_required?: boolean;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  priority?: number;

  @IsDateString()
  effective_from: string;

  @IsDateString()
  @IsOptional()
  effective_to?: string;

  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbationCriterionInputDto)
  @IsOptional()
  criteria?: ProbationCriterionInputDto[];
}
