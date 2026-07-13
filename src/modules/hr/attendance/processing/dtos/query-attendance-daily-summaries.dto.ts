import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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

  @ApiPropertyOptional({ example: 123 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  employeeId?: number;

  @ApiPropertyOptional({ example: 'EMP-001', description: 'Filter by employee number' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  employee_no?: string;

  @ApiPropertyOptional({ example: 'EMP-001', description: 'Filter by employee number' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  employeeNo?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsDateString()
  @IsOptional()
  to_date?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsDateString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: 5, description: 'Filter by branch ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional({ example: 5, description: 'Filter by branch ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branchId?: number;

  @ApiPropertyOptional({ example: 8, description: 'Filter by department ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  department_id?: number;

  @ApiPropertyOptional({ example: 8, description: 'Filter by department ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  departmentId?: number;

  @ApiPropertyOptional({ example: 5, description: 'Filter by organization ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  organization_id?: number;

  @ApiPropertyOptional({ example: 5, description: 'Filter by organization ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  organizationId?: number;

  @ApiPropertyOptional({ example: 12, description: 'Filter by shift ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  shift_id?: number;

  @ApiPropertyOptional({ example: 12, description: 'Filter by shift ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  shiftId?: number;

  @ApiPropertyOptional({ example: 3, description: 'Filter by timetable ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  timetable_id?: number;

  @ApiPropertyOptional({ example: 3, description: 'Filter by timetable ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  timetableId?: number;

  @ApiPropertyOptional({
    enum: AttendanceDailyStatusEnum,
    example: AttendanceDailyStatusEnum.PRESENT,
  })
  @IsEnum(AttendanceDailyStatusEnum)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  status?: AttendanceDailyStatusEnum;
}
