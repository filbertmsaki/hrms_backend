import { PartialType } from '@nestjs/mapped-types';
import { CreateOffboardingWorkflowDto } from './create-offboarding-workflow.dto';

export class UpdateOffboardingWorkflowDto extends PartialType(
  CreateOffboardingWorkflowDto,
) {}
