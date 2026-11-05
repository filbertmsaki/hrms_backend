import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Min,
} from 'class-validator';
import { LeaveAccrualMethodEnum } from '../enums/leave-accrual-method.enum';

export class LeavePolicyTypeInputDto {
  @Type(() => Number)
  @IsInt()
  leave_type_id: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  annual_quota_days: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  max_per_request_days?: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  requires_approval?: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  encashment_enabled?: boolean;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  maximum_encashment_days?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @IsOptional()
  encashment_rate_divisor?: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  minimum_balance_after_encashment?: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  encashment_requires_approval?: boolean;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  maximum_accumulation_days?: number;

  /** null/omitted = use the policy's accrual method. */
  @IsEnum(LeaveAccrualMethodEnum)
  @IsOptional()
  accrual_method?: LeaveAccrualMethodEnum | null;

  /** null/omitted = use the leave type's basic carry-forward settings. */
  @IsBoolean()
  @IsOptional()
  carry_forward_enabled?: boolean | null;

  /** null/omitted = no cap. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  carry_forward_max_days?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  carry_forward_expiry_months?: number | null;

  /** Fixed expiry date in the new leave year, MM-DD. */
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/, {
    message: 'carry_forward_expiry_date must be MM-DD',
  })
  @IsOptional()
  carry_forward_expiry_date?: string | null;

  @IsBoolean()
  @IsOptional()
  carry_forward_auto_expire?: boolean;

  @IsBoolean()
  @IsOptional()
  carry_forward_consume_first?: boolean;
}
