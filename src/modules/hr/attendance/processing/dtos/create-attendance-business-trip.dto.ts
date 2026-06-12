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

export class CreateAttendanceBusinessTripDto {
  @ApiProperty({ example: 123 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2026-06-17' })
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional({ example: 'Client visit in Arusha' })
  @IsString()
  @MaxLength(3000)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  submit?: boolean = true;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
