import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PerformanceAggregationMethodEnum } from '../enums/performance-aggregation-method.enum';

export class CreatePerformanceFinancialYearDto {
  @IsString()
  @MaxLength(30)
  code: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsOptional()
  @IsEnum(PerformanceAggregationMethodEnum)
  annual_aggregation_method?: PerformanceAggregationMethodEnum;

  @IsOptional()
  @IsObject()
  aggregation_configuration?: Record<string, unknown>;
}
