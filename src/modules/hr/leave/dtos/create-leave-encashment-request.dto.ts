import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLeaveEncashmentRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leave_type_id: number;

  @IsString()
  @Matches(/^\d{4}$/)
  fiscal_year: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  requested_days: number;

  @IsString()
  @MaxLength(1000)
  reason: string;
}
