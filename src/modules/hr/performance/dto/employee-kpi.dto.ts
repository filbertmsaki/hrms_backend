import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import {
  EmployeeKpiMeasurementTypeEnum,
  EmployeeKpiProgressSourceEnum,
  EmployeeKpiReviewDecisionEnum,
  EmployeeKpiStatusEnum,
} from '../enums/employee-kpi-status.enum';

export class CreateEmployeeKpiDto {
  @Type(() => Number)
  @IsInt()
  performance_period_id: number;

  @IsString()
  @MaxLength(250)
  title: string;

  @IsString()
  @MaxLength(10000)
  description: string;

  @IsEnum(EmployeeKpiMeasurementTypeEnum)
  measurement_type: EmployeeKpiMeasurementTypeEnum;

  @IsOptional()
  @IsNumber()
  target_value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  unit?: string;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  weight: number;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsDateString()
  due_date: string;

  @IsOptional()
  @IsEnum(EmployeeKpiProgressSourceEnum)
  progress_source?: EmployeeKpiProgressSourceEnum;
}

export class UpdateEmployeeKpiDto extends PartialType(CreateEmployeeKpiDto) {}

export class ReviewEmployeeKpiDto {
  @IsEnum(EmployeeKpiReviewDecisionEnum)
  decision: EmployeeKpiReviewDecisionEnum;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}

export class UpdateEmployeeKpiActualDto {
  @IsNumber()
  @Min(0)
  actual_value: number;
}

export class EmployeeKpiQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  performance_period_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employee_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  department_id?: number;

  @IsOptional()
  @IsEnum(EmployeeKpiStatusEnum)
  status?: EmployeeKpiStatusEnum;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reviewer_employee_id?: number;
}
