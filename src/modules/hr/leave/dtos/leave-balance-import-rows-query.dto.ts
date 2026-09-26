import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export enum LeaveBalanceImportRowFilterEnum {
  ALL = 'ALL',
  VALID = 'VALID',
  WARNING = 'WARNING',
  INVALID = 'INVALID',
  CHANGED = 'CHANGED',
  UNCHANGED = 'UNCHANGED',
  CONFLICT = 'CONFLICT',
  IMPORTED = 'IMPORTED',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}

export class LeaveBalanceImportRowsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: LeaveBalanceImportRowFilterEnum })
  @IsEnum(LeaveBalanceImportRowFilterEnum)
  @IsOptional()
  status?: LeaveBalanceImportRowFilterEnum;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  leave_type_id?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  department_id?: number;
}
