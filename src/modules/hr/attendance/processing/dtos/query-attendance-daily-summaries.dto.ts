import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { AttendanceDailyStatusEnum } from '../enums/attendance-daily-status.enum';

/** Filter value meaning "any leave type". */
export const ATTENDANCE_ON_LEAVE_STATUS = 'ON_LEAVE' as const;
export const ATTENDANCE_LEAVE_STATUSES: AttendanceDailyStatusEnum[] = [
  AttendanceDailyStatusEnum.LEAVE,
  AttendanceDailyStatusEnum.SICK_LEAVE,
  AttendanceDailyStatusEnum.ANNUAL_LEAVE,
  AttendanceDailyStatusEnum.UNPAID_LEAVE,
];

export class QueryAttendanceDailySummariesDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Only check-ins at or after this local time (HH:mm)',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  check_in_after?: string;

  @ApiPropertyOptional({
    description: 'Only check-ins at or before this local time (HH:mm)',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  check_in_before?: string;

  @ApiPropertyOptional({ description: 'Only rows with late minutes' })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  @IsOptional()
  late_only?: boolean;

  @ApiPropertyOptional({
    description: 'Only rows with early departure minutes',
  })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  @IsOptional()
  early_departure_only?: boolean;

  @ApiPropertyOptional({
    description: 'Only rows with calculated overtime minutes',
  })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  @IsOptional()
  overtime_only?: boolean;

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

  @ApiPropertyOptional({
    example: 'EMP-001',
    description: 'Filter by employee number',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  employee_no?: string;

  @ApiPropertyOptional({
    example: 'EMP-001',
    description: 'Filter by employee number',
  })
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

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  start_date?: string;

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

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsDateString()
  @IsOptional()
  end_date?: string;

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
    enum: [
      ...Object.values(AttendanceDailyStatusEnum),
      ATTENDANCE_ON_LEAVE_STATUS,
    ],
    example: AttendanceDailyStatusEnum.PRESENT,
    description:
      'One attendance status, or ON_LEAVE for any leave type (LEAVE, SICK_LEAVE, ANNUAL_LEAVE, UNPAID_LEAVE).',
  })
  @IsIn([
    ...Object.values(AttendanceDailyStatusEnum),
    ATTENDANCE_ON_LEAVE_STATUS,
  ])
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  status?: AttendanceDailyStatusEnum | typeof ATTENDANCE_ON_LEAVE_STATUS;
}
