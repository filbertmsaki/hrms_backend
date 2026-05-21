import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateShiftScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  shift_id: number;

  @IsDateString()
  schedule_date: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  generated_from_rotation?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  override_shift_id?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  holiday_id?: number | null;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_off_day?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  assigned_by?: number | null;

  @IsString()
  @IsOptional()
  remarks?: string;
}
