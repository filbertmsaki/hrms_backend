import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { EmployeeTimetableStatusEnum } from '../enums/employee-timetable-status.enum';

export class CreateEmployeeTimetableDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  timetable_id: number;

  @IsDateString()
  effective_from: string;

  @IsDateString()
  @IsOptional()
  effective_to?: string | null;

  @ApiPropertyOptional({ enum: EmployeeTimetableStatusEnum })
  @IsEnum(EmployeeTimetableStatusEnum)
  @IsOptional()
  status?: EmployeeTimetableStatusEnum;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  assigned_by?: number | null;
}
