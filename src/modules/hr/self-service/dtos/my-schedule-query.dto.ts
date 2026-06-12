import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class MyScheduleQueryDto {
  @ApiPropertyOptional({ example: '2026-06-12' })
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-06-18' })
  @IsDateString()
  @IsOptional()
  to_date?: string;

  @ApiPropertyOptional({ example: 7, default: 7, minimum: 1, maximum: 31 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  days?: number;
}
