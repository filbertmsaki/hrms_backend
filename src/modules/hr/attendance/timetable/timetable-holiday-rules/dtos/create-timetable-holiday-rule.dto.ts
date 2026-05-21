import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { TimetableHolidayActionTypeEnum } from '../enums/timetable-holiday-action-type.enum';

export class CreateTimetableHolidayRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  timetable_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  holiday_group_id: number;

  @IsEnum(TimetableHolidayActionTypeEnum)
  action_type: TimetableHolidayActionTypeEnum;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  apply_overtime_rules?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  auto_mark_offday?: boolean;
}
