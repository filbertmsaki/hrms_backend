import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CreateTimetableShiftRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  timetable_day_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  shift_id: number;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  priority_order?: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  max_employees?: number | null;
}
