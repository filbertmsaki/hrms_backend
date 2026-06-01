import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RecalculateAttendanceDto {
  @ApiProperty({ example: '2026-05-01' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2026-05-31' })
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional({ example: 123 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @ApiPropertyOptional({ example: 'Shift/timetable rules updated' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  process_immediately?: boolean = true;
}
