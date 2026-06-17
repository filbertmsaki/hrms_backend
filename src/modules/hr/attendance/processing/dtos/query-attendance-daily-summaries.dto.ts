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

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsDateString()
  @IsOptional()
  to_date?: string;

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
}
