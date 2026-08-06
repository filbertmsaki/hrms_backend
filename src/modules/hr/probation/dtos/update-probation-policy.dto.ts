import { PartialType } from '@nestjs/mapped-types';
import { CreateProbationPolicyDto } from './create-probation-policy.dto';

export class UpdateProbationPolicyDto extends PartialType(
  CreateProbationPolicyDto,
) {}
