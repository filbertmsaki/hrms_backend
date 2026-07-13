import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class GenerateLeaveBalancesDto {
  @Matches(/^\d{4}$/)
  @IsString()
  @IsOptional()
  fiscal_year?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  employee_id?: number;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  leave_type_id?: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  force_recalculate?: boolean;
}
