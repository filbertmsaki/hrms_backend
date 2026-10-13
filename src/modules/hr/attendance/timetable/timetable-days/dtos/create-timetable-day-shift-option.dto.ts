import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CreateTimetableDayShiftOptionDto {
  @Type(() => Number) @IsInt() @Min(1) timetable_day_id: number;
  @Type(() => Number) @IsInt() @Min(1) shift_id: number;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() priority_order?: number;
  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? null
      : Number(value),
  )
  @IsInt()
  @Min(1)
  @IsOptional()
  max_employees?: number | null;
  @Type(() => Boolean) @IsBoolean() @IsOptional() is_primary?: boolean;
}
