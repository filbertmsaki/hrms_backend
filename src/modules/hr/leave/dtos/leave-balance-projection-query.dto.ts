import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import type { AccrualPeriod } from '../utils/leave-accrual.util';

export class LeaveBalanceProjectionQueryDto {
  @ApiPropertyOptional({ description: 'Required for HR; ignored for /me' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leave_type_id?: number;

  @ApiPropertyOptional({ example: '2026-11-05', description: 'Default today' })
  @IsOptional()
  @IsDateString()
  as_of?: string;

  @ApiPropertyOptional({ enum: ['day', 'week', 'month', 'year'] })
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  period?: AccrualPeriod;
}
