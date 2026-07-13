import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class OnboardingShiftProvisioningDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shift_id: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  effective_from?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  effective_to?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  rotation_group_id?: number | null;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}
