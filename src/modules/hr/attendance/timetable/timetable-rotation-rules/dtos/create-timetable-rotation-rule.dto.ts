import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CreateTimetableRotationRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rotation_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  day_index: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  shift_id?: number | null;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_off_day?: boolean;
}
