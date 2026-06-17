import { PartialType } from '@nestjs/mapped-types';
import { CreateLeaveWorkflowDto } from './create-leave-workflow.dto';

export class UpdateLeaveWorkflowDto extends PartialType(
  CreateLeaveWorkflowDto,
) {}
