import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ShiftChangeRequestStatusEnum } from '../enums/shift-change-request-status.enum';

export class CreateShiftChangeRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  current_shift_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  requested_shift_id: number;

  @IsDateString()
  request_date: string;

  @IsString()
  reason: string;

  @ApiPropertyOptional({ enum: ShiftChangeRequestStatusEnum })
  @IsEnum(ShiftChangeRequestStatusEnum)
  @IsOptional()
  status?: ShiftChangeRequestStatusEnum;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  approved_by?: number | null;

  @IsDateString()
  @IsOptional()
  approved_at?: string | null;
}
