import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateEmployeeDesignationDto {
  @Type(() => Number)
  @IsInt()
  employee_id: number;

  @Type(() => Number)
  @IsInt()
  designation_id: number;

  @IsDateString()
  start_date: string;

  @IsDateString()
  @IsOptional()
  end_date?: string;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_current?: boolean;

  @IsString()
  @IsOptional()
  remarks?: string;
}
