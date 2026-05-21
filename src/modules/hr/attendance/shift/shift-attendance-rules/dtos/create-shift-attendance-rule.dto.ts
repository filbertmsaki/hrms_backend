import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CreateShiftAttendanceRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shift_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  late_after_minutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  absent_after_minutes: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  half_day_after_minutes: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_multiple_checkin?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  auto_mark_absent?: boolean;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_mobile_attendance?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  allow_remote_attendance?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  require_geofence?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  require_biometric?: boolean;
}
