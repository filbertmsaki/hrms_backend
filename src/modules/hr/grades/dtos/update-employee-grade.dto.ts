import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeGradeDto } from './create-employee-grade.dto';

export class UpdateEmployeeGradeDto extends PartialType(
  CreateEmployeeGradeDto,
) {}
