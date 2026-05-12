import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { LeaveGenderRestrictionEnum } from '../enums/leave-gender-restriction.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';

export class CreateLeaveTypeDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(50)
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_paid?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  requires_attachment?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_carry_forward_allowed?: boolean;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  max_carry_forward_days?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  max_days_per_year?: number;

  @ApiPropertyOptional({ enum: LeaveGenderRestrictionEnum })
  @IsEnum(LeaveGenderRestrictionEnum)
  @IsOptional()
  gender_restriction?: LeaveGenderRestrictionEnum;

  @ApiPropertyOptional({ enum: LeaveRecordStatusEnum, default: 'active' })
  @IsEnum(LeaveRecordStatusEnum)
  @IsOptional()
  status?: LeaveRecordStatusEnum;
}
