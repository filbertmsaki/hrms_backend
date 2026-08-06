import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeDto } from './create-employee.dto';

class MutableEmployeeProfileDto extends OmitType(CreateEmployeeDto, [
  'employee_no',
  'employment_status',
  'exit_date',
  'exit_reason',
  'primary_branch_id',
  'primary_department_id',
  'primary_position_id',
  'position_id',
  'reports_to',
  'departments',
  'grade_id',
  'cost_center_id',
  'employment_type',
  'probation_start_date',
  'probation_end_date',
  'confirmation_due_date',
  'confirmation_date',
  'confirmation_status',
  'confirmation_notes',
  'onboarding',
] as const) {}

export class UpdateEmployeeDto extends PartialType(MutableEmployeeProfileDto) {}
