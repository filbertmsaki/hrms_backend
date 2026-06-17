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
import { ShiftBreakTypeEnum } from '../enums/shift-break-type.enum';

export class CreateShiftBreakDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shift_id: number;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsEnum(ShiftBreakTypeEnum)
  break_type: ShiftBreakTypeEnum;

  @IsString()
  @MaxLength(8)
  start_time: string;

  @IsString()
  @MaxLength(8)
  end_time: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  duration_minutes: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_paid?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_flexible?: boolean;
}
