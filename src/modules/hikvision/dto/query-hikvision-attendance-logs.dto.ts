import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryHikvisionAttendanceLogsDto extends PaginationDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  employee_no?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  major?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  minor?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  door_no?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  serial_no?: string;

  @ApiPropertyOptional({ example: '2026-05-29T00:00:00+03:00' })
  @IsDateString()
  @IsOptional()
  start_time?: string;

  @ApiPropertyOptional({ example: '2026-05-29T23:59:59+03:00' })
  @IsDateString()
  @IsOptional()
  end_time?: string;
}
