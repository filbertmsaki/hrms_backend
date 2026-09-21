import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeMovementDto } from './create-employee-movement.dto';

export class UpdateEmployeeMovementDto extends PartialType(
  CreateEmployeeMovementDto,
) {}
