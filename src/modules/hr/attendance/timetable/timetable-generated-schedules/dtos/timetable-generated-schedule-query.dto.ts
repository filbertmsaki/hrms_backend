import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { TimetableGeneratedScheduleSourceRuleEnum } from '../enums/timetable-generated-schedule-source-rule.enum';

export class TimetableGeneratedScheduleQueryDto extends PaginationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  timetable_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  holiday_id?: number;

  @ApiPropertyOptional({ enum: TimetableGeneratedScheduleSourceRuleEnum })
  @IsEnum(TimetableGeneratedScheduleSourceRuleEnum)
  @IsOptional()
  source_rule?: TimetableGeneratedScheduleSourceRuleEnum;

  @IsDateString()
  @IsOptional()
  from_date?: string;

  @IsDateString()
  @IsOptional()
  to_date?: string;
}
