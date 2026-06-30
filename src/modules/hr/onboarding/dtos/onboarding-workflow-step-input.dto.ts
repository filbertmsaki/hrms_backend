import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { OnboardingStepTypeEnum } from '../enums/onboarding-step-type.enum';

export class OnboardingWorkflowStepInputDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(OnboardingStepTypeEnum)
  step_type: OnboardingStepTypeEnum;

  @ValidateIf((o: OnboardingWorkflowStepInputDto) => !o.assigned_user_id)
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_role_id?: number;

  @ValidateIf((o: OnboardingWorkflowStepInputDto) => !o.assigned_role_id)
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  assigned_user_id?: number;

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
}
