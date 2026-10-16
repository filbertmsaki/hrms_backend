import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreatePerformancePlanItemDto {
  @IsInt()
  @Min(1)
  kpi_definition_version_id: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
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
  @Min(1)
  employee_id: number;

  @IsInt()
  @Min(1)
  financial_year_id: number;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  manager_employee_id?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePerformancePlanItemDto)
  items: CreatePerformancePlanItemDto[];
}
