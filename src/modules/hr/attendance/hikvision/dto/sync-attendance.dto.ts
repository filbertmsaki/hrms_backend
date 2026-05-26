import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SyncAttendanceDto {
  @ApiPropertyOptional({ example: '2026-05-25T00:00:00+03:00' })
  @IsDateString()
  @IsOptional()
  start_time?: string;

  @ApiPropertyOptional({ example: '2026-05-25T23:59:59+03:00' })
  @IsDateString()
  @IsOptional()
  end_time?: string;

  @ApiPropertyOptional({ example: 5, description: 'Hikvision major event type filter' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  major?: number;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  max_results?: number;

  @ApiPropertyOptional({ example: '1' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  search_id?: string;
}
