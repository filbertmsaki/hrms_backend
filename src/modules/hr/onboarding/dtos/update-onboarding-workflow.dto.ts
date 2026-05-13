import { PartialType } from '@nestjs/mapped-types';
import { CreateOnboardingWorkflowDto } from './create-onboarding-workflow.dto';

export class UpdateOnboardingWorkflowDto extends PartialType(
  CreateOnboardingWorkflowDto,
) {}
