import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateShiftOvertimeRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shift_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  overtime_start_after_minutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_daily_overtime_minutes: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  overtime_rate_multiplier: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weekend_multiplier: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  holiday_multiplier: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  requires_approval?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  auto_calculate?: boolean;
}
