import { IsEnum } from 'class-validator';
import { PerformancePeriodTypeEnum } from '../enums/performance-period-type.enum';

export class CalculatePerformanceAggregatesDto {
  @IsEnum(PerformancePeriodTypeEnum)
  period_type: PerformancePeriodTypeEnum;
}
