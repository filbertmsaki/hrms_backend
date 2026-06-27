import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SyncAttendanceByRangeDto {
  @ApiProperty({ example: '2026-05-29T00:00:00+03:00' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-05-29T23:59:59+03:00' })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ example: '00000001' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  employeeNo?: string;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxResults?: number = 100;
}
