import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { LeaveBalanceAdjustmentModeEnum } from '../enums/leave-balance-adjustment-mode.enum';

export class AdjustLeaveBalanceDto {
  @Type(() => Number)
  @IsInt()
  employee_id: number;

  @Type(() => Number)
  @IsInt()
  leave_type_id: number;

  @Matches(/^\d{4}$/)
  @IsString()
  fiscal_year: string;

  @IsEnum(LeaveBalanceAdjustmentModeEnum)
  mode: LeaveBalanceAdjustmentModeEnum;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsString()
  @MaxLength(500)
  reason: string;
}
