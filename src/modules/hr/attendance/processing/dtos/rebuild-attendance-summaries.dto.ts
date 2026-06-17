import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class RebuildAttendanceSummariesDto {
  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2026-06-16' })
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional({
    example: 123,
    description: 'Limit to a single employee. Omit to rebuild for all employees in the range.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Delete existing summaries before rebuilding. Use false to only upsert without clearing.',
  })
  @IsBoolean()
  @IsOptional()
  force_rebuild?: boolean;

  @ApiPropertyOptional({
    example: 'Shift rules updated',
    description: 'Reason for the rebuild. Recorded on the job when async is true.',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'When true, creates a queued job and returns immediately. ' +
      'Trigger execution via POST /processing/jobs/run-pending or GET /processing/jobs to monitor. ' +
      'When false (default), runs synchronously and returns the result.',
  })
  @IsBoolean()
  @IsOptional()
  async?: boolean;
}
