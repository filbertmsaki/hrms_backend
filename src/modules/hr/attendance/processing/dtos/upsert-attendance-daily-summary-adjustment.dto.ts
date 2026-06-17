import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertAttendanceDailySummaryAdjustmentDto {
  @ApiPropertyOptional({ example: '2026-06-12T08:03:00.000Z' })
  @IsDateString()
  @IsOptional()
  check_in_at?: string | null;

  @ApiPropertyOptional({ example: '2026-06-12T17:12:00.000Z' })
  @IsDateString()
  @IsOptional()
  check_out_at?: string | null;

  @ApiPropertyOptional({ example: 'PRESENT' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  attendance_status?: string;

  @ApiPropertyOptional({ example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  break_minutes?: number | null;

  @ApiPropertyOptional({ example: 480 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  worked_minutes?: number | null;

  @ApiPropertyOptional({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  late_minutes?: number | null;

  @ApiPropertyOptional({ example: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  early_departure_minutes?: number | null;

  @ApiPropertyOptional({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  overtime_minutes?: number | null;

  @ApiPropertyOptional({
    example: 'Approved manual correction by HR after reviewing CCTV.',
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
