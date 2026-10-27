import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum ManagerActivitySummaryPeriodEnum {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export class ManagerActivitySummaryQueryDto {
  @IsEnum(ManagerActivitySummaryPeriodEnum)
  @IsOptional()
  period_type?: ManagerActivitySummaryPeriodEnum;

  @IsDateString()
  @IsOptional()
  anchor_date?: string;
}
