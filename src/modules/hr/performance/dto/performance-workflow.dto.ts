import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApprovePerformanceReviewDto } from './approve-performance-review.dto';
import { PerformanceWorkflowStepTypeEnum } from '../enums/performance-workflow-step-type.enum';

export class PerformanceWorkflowStepDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(160)
  label: string;

  @IsEnum(PerformanceWorkflowStepTypeEnum)
  type: PerformanceWorkflowStepTypeEnum;

  @IsInt()
  @Min(1)
  sequence_number: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  can_finalize?: boolean;

  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}

export class CreatePerformanceWorkflowConfigDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  applies_to_department_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  applies_to_position_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  review_type?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PerformanceWorkflowStepDto)
  steps: PerformanceWorkflowStepDto[];
}

export class PerformanceWorkflowActionDto extends ApprovePerformanceReviewDto {
  @IsIn(['APPROVE', 'RETURN', 'REJECT'])
  decision: 'APPROVE' | 'RETURN' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}
