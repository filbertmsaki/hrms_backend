import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EmploymentTypeEnum } from '../../employees/enums/employment-type.enum';
import { EmployeeMovementTypeEnum } from '../enums/employee-movement-type.enum';
import { MovementCompensationInputDto } from './movement-compensation-input.dto';

export class CreateEmployeeMovementDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @IsEnum(EmployeeMovementTypeEnum)
  movement_type: EmployeeMovementTypeEnum;

  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(4000)
  reason: string;

  @IsDateString()
  effective_date: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  new_branch_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  new_department_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  new_position_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  new_grade_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  new_cost_center_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  new_manager_employee_id?: number;

  @IsEnum(EmploymentTypeEnum)
  @IsOptional()
  new_employment_type?: EmploymentTypeEnum;

  @ValidateNested()
  @Type(() => MovementCompensationInputDto)
  @IsOptional()
  salary_revision?: MovementCompensationInputDto;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
