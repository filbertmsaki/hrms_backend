import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { TimetableStatusEnum } from '../enums/timetable-status.enum';
import { TimetableTypeEnum } from '../enums/timetable-type.enum';

export class CreateTimetableDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branch_id?: number | null;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  @MaxLength(50)
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TimetableTypeEnum)
  timetable_type: TimetableTypeEnum;

  @IsString()
  @MaxLength(100)
  timezone: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @ApiPropertyOptional({ enum: TimetableStatusEnum })
  @IsEnum(TimetableStatusEnum)
  @IsOptional()
  status?: TimetableStatusEnum;
}
