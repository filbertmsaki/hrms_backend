import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { AttendanceBusinessTripStatusEnum } from '../enums/attendance-business-trip-status.enum';

export class QueryAttendanceBusinessTripsDto extends PaginationDto {
  @ApiPropertyOptional({ example: 123 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @ApiPropertyOptional({ enum: AttendanceBusinessTripStatusEnum })
  @IsEnum(AttendanceBusinessTripStatusEnum)
  @IsOptional()
  status?: AttendanceBusinessTripStatusEnum;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsDateString()
  @IsOptional()
  to_date?: string;
}
