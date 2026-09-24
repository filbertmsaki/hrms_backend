import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { OnboardingStepTypeEnum } from '../enums/onboarding-step-type.enum';
import { OnboardingTaskTypeEnum } from '../enums/onboarding-task-type.enum';

export class OnboardingWorkflowStepInputDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(OnboardingStepTypeEnum)
  step_type: OnboardingStepTypeEnum;

  @IsEnum(OnboardingTaskTypeEnum)
  @IsOptional()
  task_type?: OnboardingTaskTypeEnum;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_role_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_user_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  assigned_department_id?: number;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_required?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  due_days?: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  required_document_type_code?: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  requires_verified_document?: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  completion_evidence_required?: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  requires_employee_acknowledgement?: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
