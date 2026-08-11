import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { EmployeeDepartmentInputDto } from './employee-department-input.dto';

export class ChangeEmployeeAssignmentDto {
  @IsDateString()
  effective_date: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  branch_id?: number | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeDepartmentInputDto)
  @IsOptional()
  departments?: EmployeeDepartmentInputDto[];

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  primary_position_id?: number | null;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  reports_to?: number | null;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  grade_id?: number | null;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  cost_center_id?: number | null;

  @IsString()
  @IsOptional()
  reason?: string;
}
