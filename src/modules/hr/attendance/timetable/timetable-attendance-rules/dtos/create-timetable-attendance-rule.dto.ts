import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CreateTimetableAttendanceRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  timetable_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  late_after_minutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  half_day_after_minutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  absent_after_minutes: number;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_early_checkin?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_late_checkout?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  auto_absent_if_no_checkin?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_overtime_minutes: number;
}
