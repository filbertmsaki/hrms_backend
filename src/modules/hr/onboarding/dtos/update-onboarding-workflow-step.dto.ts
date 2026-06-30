import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOnboardingWorkflowStepDto } from './create-onboarding-workflow-step.dto';

export class UpdateOnboardingWorkflowStepDto extends PartialType(
  CreateOnboardingWorkflowStepDto,
) {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  step_order?: number;
}
