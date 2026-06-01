import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';

export class QueryAttendanceDailySummariesDto extends PaginationDto {
  @ApiPropertyOptional({ example: 123 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsDateString()
  @IsOptional()
  to_date?: string;

  @ApiPropertyOptional({ example: 'PRESENT' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  attendance_status?: string;
}
