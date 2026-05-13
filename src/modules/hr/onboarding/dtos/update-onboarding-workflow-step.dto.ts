import { PartialType } from '@nestjs/mapped-types';
import { CreateOnboardingWorkflowStepDto } from './create-onboarding-workflow-step.dto';

export class UpdateOnboardingWorkflowStepDto extends PartialType(
  CreateOnboardingWorkflowStepDto,
) {}
