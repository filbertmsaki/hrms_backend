import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branch_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  department_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id?: number;

  @IsOptional()
  @IsString()
  purpose?: string;
}

export class AnalyticsRefreshDto extends AnalyticsQueryDto {
  @IsOptional()
  @IsString()
  dataset_code?: string;

  @IsOptional()
  @IsIn(['INCREMENTAL', 'FULL_REFRESH', 'PERIOD_CLOSE', 'MANUAL'])
  refresh_mode?: string;
}

export class AnalyticsCustomReportDto extends AnalyticsQueryDto {
  @IsString()
  dataset_code: string;

  @IsArray()
  @IsString({ each: true })
  dimensions: string[];

  @IsArray()
  @IsString({ each: true })
  measures: string[];

  @IsOptional()
  filters?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(250000)
  limit?: number;
}

export class AnalyticsExportDto extends AnalyticsCustomReportDto {
  @IsOptional()
  @IsIn(['CSV', 'JSON'])
  output_format?: string;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}

export class StatutoryReportRunDto extends AnalyticsQueryDto {
  @IsString()
  report_code: string;
}
