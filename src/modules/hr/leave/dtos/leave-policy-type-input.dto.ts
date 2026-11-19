import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
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

  @IsIn(['hire_date', 'probation_completion'])
  @IsOptional()
  accrual_start_basis?: 'hire_date' | 'probation_completion';

  @IsIn(['in_advance', 'in_arrears'])
  @IsOptional()
  accrual_timing?: 'in_advance' | 'in_arrears';

  @IsBoolean()
  @IsOptional()
  accrual_prorate?: boolean;

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

  /** all | limited | percentage; null = limited when a cap is set, else all. */
  @IsIn(['all', 'limited', 'percentage'])
  @IsOptional()
  carry_forward_method?: 'all' | 'limited' | 'percentage' | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  carry_forward_percentage?: number | null;

  /** false = unused days that are not carried or encashed are retained. */
  @IsBoolean()
  @IsOptional()
  lapse_enabled?: boolean;

  /** Unused days that may never lapse (statutory or contractual minimum). */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  protected_minimum_days?: number;

  @IsBoolean()
  @IsOptional()
  auto_encash_enabled?: boolean;

  @IsIn(['all', 'limited', 'percentage'])
  @IsOptional()
  auto_encash_method?: 'all' | 'limited' | 'percentage' | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  auto_encash_max_days?: number | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  auto_encash_percentage?: number | null;

  @IsIn(['basic', 'gross'])
  @IsOptional()
  encashment_salary_basis?: 'basic' | 'gross';
}
