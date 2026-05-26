import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';

export class AttendanceFilterDto extends PaginationDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  device_id?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  employee_no?: string;

  @ApiPropertyOptional({ example: '2026-05-25T00:00:00+03:00' })
  @IsDateString()
  @IsOptional()
  from_time?: string;

  @ApiPropertyOptional({ example: '2026-05-25T23:59:59+03:00' })
  @IsDateString()
  @IsOptional()
  to_time?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  event_type?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(50)
  @IsOptional()
  attendance_status?: string;
}
