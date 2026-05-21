import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CreateShiftRotationRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rotation_group_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  shift_id?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  day_index: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_off_day?: boolean;
}
