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

export class SyncAttendanceByEmployeeDto {
  @ApiProperty({ example: '00000062' })
  @IsString()
  @MaxLength(100)
  employeeNo: string;

  @ApiProperty({ example: '2026-05-29T00:00:00+03:00' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-05-29T23:59:59+03:00' })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxResults?: number = 100;
}
