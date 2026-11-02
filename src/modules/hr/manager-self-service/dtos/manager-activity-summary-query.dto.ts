import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

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

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 25;
}
