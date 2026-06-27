import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class SyncAttendanceByDateDto {
  @ApiProperty({ example: '2026-05-29' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @ApiPropertyOptional({ example: 'Africa/Dar_es_Salaam' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  timezone?: string;

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
