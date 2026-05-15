import { PartialType } from '@nestjs/mapped-types';
import { CreateLeaveWorkflowStepDto } from './create-leave-workflow-step.dto';

export class UpdateLeaveWorkflowStepDto extends PartialType(
  CreateLeaveWorkflowStepDto,
) {}
