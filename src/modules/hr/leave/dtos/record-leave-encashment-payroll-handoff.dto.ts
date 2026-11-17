import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

function trimReference(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RecordLeaveEncashmentPayrollHandoffDto {
  /** Optional; defaults to PAYROLL-INPUT-<id> of the created payroll input. */
  @Transform(({ value }: TransformFnParams) => trimReference(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  payroll_period_code: string;

  /** Defaults to the currency of the calculated amount. */
  @Transform(({ value }: TransformFnParams) => trimReference(value))
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /**
   * Leave empty to use the policy-calculated amount. A different amount is an
   * override: it needs leave_encashment:override_amount and override_reason.
   */
  @Transform(({ value }: TransformFnParams) =>
    value === undefined || value === null || value === ''
      ? undefined
      : Number(value),
  )
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  payable_amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  override_reason?: string;
}

export class ReverseLeaveEncashmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

export class ConfirmLeaveEncashmentFinanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  general_ledger_account_code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  liability_account_code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  expense_account_code: string;

  /** TAXABLE, NON_TAXABLE or PARTIALLY_TAXABLE. */
  @IsString()
  @IsNotEmpty()
  tax_treatment: string;

  @Transform(({ value }: TransformFnParams) => Number(value))
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  taxable_percentage: number;

  @Transform(
    ({ value }: TransformFnParams) => value === true || value === 'true',
  )
  @IsBoolean()
  pensionable: boolean;

  @IsDateString()
  effective_date: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  notes: string;

  /** PUBLIC_HOLIDAY_WORK or LEAVE_ENCASHMENT (default). */
  @IsOptional()
  @IsString()
  component_code?: string;
}

export class RecordLeaveEncashmentPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  payment_reference: string;

  @IsDateString()
  paid_at: string;

  @IsString()
  @Length(3, 3)
  currency: string;

  @Transform(({ value }: TransformFnParams) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;
}
