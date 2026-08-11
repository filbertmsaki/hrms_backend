import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateKpiApplicabilityRuleDto {
  @IsInt()
  kpi_definition_version_id: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsInt()
  financial_year_id?: number;

  @IsOptional()
  @IsInt()
  branch_id?: number;

  @IsOptional()
  @IsInt()
  department_id?: number;

  @IsOptional()
  @IsInt()
  position_id?: number;

  @IsOptional()
  @IsInt()
  grade_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employment_type?: string;

  @IsOptional()
  @IsInt()
  employee_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  review_cycle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  template_code?: string;

  @IsOptional()
  @IsNumber()
  weight_override?: number;

  @IsOptional()
  @IsNumber()
  target_override?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
