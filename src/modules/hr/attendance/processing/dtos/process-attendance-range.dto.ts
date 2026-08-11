import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class ProcessAttendanceRangeDto {
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

  @ApiPropertyOptional({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  rebuild_summaries?: boolean = true;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  force_rebuild_summaries?: boolean = false;

  @ApiPropertyOptional({ example: 500, default: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  batch_size?: number = 500;
}
