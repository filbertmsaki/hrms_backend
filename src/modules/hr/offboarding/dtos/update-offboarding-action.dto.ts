import { PartialType } from '@nestjs/mapped-types';
import { CreateOffboardingActionDto } from './create-offboarding-action.dto';

export class UpdateOffboardingActionDto extends PartialType(
  CreateOffboardingActionDto,
) {}
