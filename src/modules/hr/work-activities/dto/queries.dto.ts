import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import {
  DailyActivityEntryReviewStatusEnum,
  DailyActivityOriginEnum,
  DailyActivityPriorityEnum,
  DailyActivityStatusEnum,
} from '../enums/work-activity.enums';

export class WorkActivityQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  department_id?: number;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employee_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activity_category_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employee_kpi_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assigned_by_employee_id?: number;

  @IsOptional()
  @IsEnum(DailyActivityOriginEnum)
  origin?: DailyActivityOriginEnum;

  @IsOptional()
  @IsEnum(DailyActivityStatusEnum)
  work_status?: DailyActivityStatusEnum;

  @IsOptional()
  @IsEnum(DailyActivityEntryReviewStatusEnum)
  review_status?: DailyActivityEntryReviewStatusEnum;

  @IsOptional()
  @IsEnum(DailyActivityPriorityEnum)
  priority?: DailyActivityPriorityEnum;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdue?: boolean;
}

export class FieldLocationMapQueryDto extends WorkActivityQueryDto {
  @IsString()
  purpose: string;
}
