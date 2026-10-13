import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertEmployeeWorkScheduleDto {
  @Type(() => Number) @IsInt() @Min(1) employee_id: number;
  @IsDateString() schedule_date: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() shift_id?: number | null;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() timetable_id?:
    | number
    | null;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  timetable_day_shift_option_id?: number | null;
  @Type(() => Boolean) @IsBoolean() @IsOptional() is_off_day?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string | null;
}
