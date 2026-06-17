import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { AttendanceDailyStatusEnum } from '../enums/attendance-daily-status.enum';

export class QueryAttendanceDailySummariesDto extends PaginationDto {
  @ApiPropertyOptional({ example: 123 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employee_id?: number;

  @ApiPropertyOptional({ example: 'EMP-001', description: 'Filter by employee number' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  employee_no?: string;

  @ApiPropertyOptional({ example: '2026-05-01', description: 'Filter by attendance date (from)' })
  @IsDateString()
  @IsOptional()
  start_time?: string;

  @ApiPropertyOptional({ example: '2026-05-31', description: 'Filter by attendance date (to)' })
  @IsDateString()
  @IsOptional()
  end_time?: string;

  @ApiPropertyOptional({ example: 5, description: 'Filter by branch/organization ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  organization_id?: number;

  @ApiPropertyOptional({
    enum: AttendanceDailyStatusEnum,
    example: AttendanceDailyStatusEnum.PRESENT,
  })
  @IsEnum(AttendanceDailyStatusEnum)
  @IsOptional()
  status?: AttendanceDailyStatusEnum;

  /** @deprecated Use start_time */
  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  from_date?: string;

  /** @deprecated Use end_time */
  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsDateString()
  @IsOptional()
  to_date?: string;

  /** @deprecated Use status */
  @ApiPropertyOptional({ example: 'PRESENT' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  attendance_status?: string;
}
