import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class RebuildAttendanceSummariesDto {
  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2026-06-16' })
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional({ example: 123, description: 'Limit to a single employee. Omit to rebuild for all employees in the range.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @ApiPropertyOptional({ default: true, description: 'Delete existing summaries before rebuilding. Use false to only upsert without clearing.' })
  @IsBoolean()
  @IsOptional()
  force_rebuild?: boolean;
}
