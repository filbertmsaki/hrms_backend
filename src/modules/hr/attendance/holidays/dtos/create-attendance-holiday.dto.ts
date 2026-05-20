import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AttendanceHolidayTypeEnum } from '../enums/attendance-holiday-type.enum';

export class CreateAttendanceHolidayDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  holiday_group_id: number;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsDateString()
  date: string;

  @IsEnum(AttendanceHolidayTypeEnum)
  type: AttendanceHolidayTypeEnum;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_paid?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  affects_overtime?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  counts_as_working_day?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number | null;
}




