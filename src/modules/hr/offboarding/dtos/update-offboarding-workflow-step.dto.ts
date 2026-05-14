import { PartialType } from '@nestjs/mapped-types';
import { CreateOffboardingWorkflowStepDto } from './create-offboarding-workflow-step.dto';

export class UpdateOffboardingWorkflowStepDto extends PartialType(
  CreateOffboardingWorkflowStepDto,
) {}
