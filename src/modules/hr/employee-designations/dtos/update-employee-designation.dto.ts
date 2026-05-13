import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeDesignationDto } from './create-employee-designation.dto';

export class UpdateEmployeeDesignationDto extends PartialType(
  CreateEmployeeDesignationDto,
) {}
