import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTimetableDayDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  timetable_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week: number;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_working_day?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  default_shift_id?: number | null;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  minimum_work_minutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  expected_check_in_time?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  expected_check_out_time?: string | null;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_flexible_time?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  flexible_start_from?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  flexible_start_to?: string | null;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  overtime_allowed?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  break_required?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  break_minutes?: number;
}
