import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreatePerformancePlanItemDto {
  @IsInt()
  kpi_definition_version_id: number;

  @IsNumber()
  weight: number;

  @IsOptional()
  @IsNumber()
  target_value?: number;

  @IsOptional()
  @IsBoolean()
  manual_entry_allowed?: boolean;

  @IsOptional()
  @IsBoolean()
  evidence_required?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePerformancePlanDto {
  @IsInt()
  employee_id: number;

  @IsInt()
  financial_year_id: number;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @IsOptional()
  @IsInt()
  manager_employee_id?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePerformancePlanItemDto)
  items: CreatePerformancePlanItemDto[];
}
