import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

function trimReference(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RecordLeaveEncashmentPayrollHandoffDto {
  @Transform(({ value }: TransformFnParams) => trimReference(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  reference: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  payroll_period_code: string;

  @Transform(({ value }: TransformFnParams) => trimReference(value))
  @IsString()
  @Length(3, 3)
  currency: string;

  @Transform(({ value }: TransformFnParams) => Number(value ?? 0))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  payable_amount: number;
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
