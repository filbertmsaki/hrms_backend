import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ShiftAssignmentStatusEnum } from '../enums/shift-assignment-status.enum';

export class CreateShiftAssignmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  shift_id: number;

  @IsDateString()
  effective_from: string;

  @IsDateString()
  @IsOptional()
  effective_to?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  rotation_group_id?: number | null;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsOptional()
  is_primary?: boolean;

  @ApiPropertyOptional({ enum: ShiftAssignmentStatusEnum })
  @IsEnum(ShiftAssignmentStatusEnum)
  @IsOptional()
  status?: ShiftAssignmentStatusEnum;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  assigned_by?: number | null;
}
