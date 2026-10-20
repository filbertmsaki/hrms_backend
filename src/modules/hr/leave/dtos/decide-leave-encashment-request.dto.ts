import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class DecideLeaveEncashmentRequestDto {
  @Type(() => Boolean)
  @IsBoolean()
  approve: boolean;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  approved_days?: number;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  comments?: string;
}
