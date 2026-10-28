import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
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

export class AnalyticsSalesFieldDetailQueryDto extends AnalyticsQueryDto {
  @IsIn([
    'PLANNED_VISITS',
    'COMPLETED_PLANNED_VISITS',
    'UNPLANNED_COMPLETED_VISITS',
    'CUSTOMER_VISITS',
    'BROKER_INTERMEDIARY_VISITS',
    'OPPORTUNITIES',
  ])
  metric:
    | 'PLANNED_VISITS'
    | 'COMPLETED_PLANNED_VISITS'
    | 'UNPLANNED_COMPLETED_VISITS'
    | 'CUSTOMER_VISITS'
    | 'BROKER_INTERMEDIARY_VISITS'
    | 'OPPORTUNITIES';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
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
  @IsIn(['CSV', 'XLSX', 'PDF', 'JSON'])
  output_format?: string;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}

export class SaveAnalyticsReportDto extends AnalyticsCustomReportDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  sorting?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  grouping?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['PRIVATE', 'DEPARTMENT', 'SHARED', 'ADMIN_ONLY'])
  visibility?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  department_scope_id?: number;
}

export class UpdateSavedAnalyticsReportDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  dataset_code?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dimensions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  measures?: string[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  sorting?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  grouping?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['PRIVATE', 'DEPARTMENT', 'SHARED', 'ADMIN_ONLY'])
  visibility?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  department_scope_id?: number | null;
}

export class QuerySavedAnalyticsReportsDto {
  @IsOptional()
  @IsString()
  dataset_code?: string;

  @IsOptional()
  @IsIn(['PRIVATE', 'DEPARTMENT', 'SHARED', 'ADMIN_ONLY'])
  visibility?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  department_scope_id?: number;
}

export class AnalyticsOperationalReportQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;

  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  quarter?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  employment_status?: string;

  @IsOptional()
  @IsString()
  approval_status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  payroll_period_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  payroll_run_id?: number;

  @IsOptional()
  @IsIn(['CSV', 'XLSX', 'PDF', 'JSON'])
  output_format?: string;
}

export class StatutoryReportRunDto extends AnalyticsQueryDto {
  @IsString()
  report_code: string;
}
