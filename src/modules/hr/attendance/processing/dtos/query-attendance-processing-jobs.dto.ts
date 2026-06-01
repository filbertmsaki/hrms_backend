import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { AttendanceProcessingJobStatusEnum } from '../enums/attendance-processing-job-status.enum';

export class QueryAttendanceProcessingJobsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: AttendanceProcessingJobStatusEnum })
  @IsEnum(AttendanceProcessingJobStatusEnum)
  @IsOptional()
  status?: AttendanceProcessingJobStatusEnum;

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
}
