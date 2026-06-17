import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { TimetableGeneratedScheduleSourceRuleEnum } from '../enums/timetable-generated-schedule-source-rule.enum';

export class CreateTimetableGeneratedScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  timetable_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  shift_id?: number | null;

  @IsDateString()
  schedule_date: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  generated_from_rotation?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_off_day?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  holiday_id?: number | null;

  @ApiPropertyOptional({ enum: TimetableGeneratedScheduleSourceRuleEnum })
  @IsEnum(TimetableGeneratedScheduleSourceRuleEnum)
  @IsOptional()
  source_rule?: TimetableGeneratedScheduleSourceRuleEnum;
}
