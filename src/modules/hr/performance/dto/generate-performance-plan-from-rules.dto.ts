import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class GeneratePerformancePlanFromRulesDto {
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
  @IsString()
  @MaxLength(40)
  review_cycle?: string;
}
