import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ShiftRotationGroupStatusEnum } from '../enums/shift-rotation-group-status.enum';

export class CreateShiftRotationGroupDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(50)
  code: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cycle_days: number;

  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: ShiftRotationGroupStatusEnum })
  @IsEnum(ShiftRotationGroupStatusEnum)
  @IsOptional()
  status?: ShiftRotationGroupStatusEnum;
}
