import { IsIn, IsOptional } from 'class-validator';
import { KpiAnalyticsQueryDto } from './kpi-analytics.dto';

export class KpiReportQueryDto extends KpiAnalyticsQueryDto {
  @IsOptional()
  @IsIn(['json', 'pdf', 'xlsx'])
  format?: 'json' | 'pdf' | 'xlsx';
}
