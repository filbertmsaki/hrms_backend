import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { PerformancePeriodStatusEnum } from '../enums/performance-period-status.enum';
import { PerformancePeriodTypeEnum } from '../enums/performance-period-type.enum';

export class CreatePerformancePeriodDto {
  @Type(() => Number)
  @IsInt()
  financial_year_id: number;

  @IsEnum(PerformancePeriodTypeEnum)
  period_type: PerformancePeriodTypeEnum;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence_number: number;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsOptional()
  @IsDateString()
  goal_setting_deadline?: string;

  @IsOptional()
  @IsDateString()
  mid_cycle_review_date?: string;

  @IsOptional()
  @IsDateString()
  final_review_deadline?: string;

  @IsOptional()
  @IsBoolean()
  allow_parallel?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  max_weightage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  score_cap?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cooling_period_days?: number;

  @IsOptional()
  @IsArray()
  rating_bands?: Array<{ label: string; min: number }>;
}

export class UpdatePerformancePeriodDto extends PartialType(
  CreatePerformancePeriodDto,
) {}

export class ReopenPerformancePeriodDto {
  @IsString()
  @MaxLength(5000)
  reason: string;
}

export class PerformancePeriodQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(PerformancePeriodStatusEnum)
  status?: PerformancePeriodStatusEnum;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  created_by_company_user_id?: number;
}
