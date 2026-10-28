import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class PublishedScoreDrilldownQueryDto {
  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  department_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

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
  limit = 20;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  period_id?: number;

  // Zero selects published, scored reviews without a configured band.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  rating_band_id?: number;

  @IsIn(['all', 'scored', 'unscored'])
  @IsOptional()
  score_state: 'all' | 'scored' | 'unscored' = 'all';

  @IsIn(['MONTHLY', 'QUARTERLY', 'ANNUAL'])
  @IsOptional()
  period_type: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' = 'MONTHLY';
}
