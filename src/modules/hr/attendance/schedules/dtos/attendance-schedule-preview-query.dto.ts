import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AttendanceSchedulePreviewQueryDto {
  @ApiPropertyOptional({
    example: 39,
    description: 'Employee ID to preview schedule for',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @ApiPropertyOptional({
    example: '2026-06-22',
    description: 'Preview start date',
  })
  @IsDateString()
  from_date: string;

  @ApiPropertyOptional({
    example: '2026-06-30',
    description: 'Preview end date',
  })
  @IsDateString()
  to_date: string;

  @ApiPropertyOptional({
    example: 'Africa/Dar_es_Salaam',
    description: 'Optional timezone override',
  })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Include resolver policy values in each day response',
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  include_policy?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Include source priority explanation',
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  include_source_priority?: boolean;

  @ApiPropertyOptional({
    example: 62,
    description: 'Maximum allowed preview days',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  @IsOptional()
  max_days?: number;
}