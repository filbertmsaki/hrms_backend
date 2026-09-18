import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
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
}

export class UpdatePerformancePeriodDto extends PartialType(
  CreatePerformancePeriodDto,
) {}

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
