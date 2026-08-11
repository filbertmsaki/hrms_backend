import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

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
}
