import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePositionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional({
    type: Number,
    deprecated: true,
    description: 'Deprecated: use department_ids instead.',
  })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  department_id?: number;

  @ApiPropertyOptional({
    type: [Number],
    description:
      'Departments this position is assigned to. Replaces the deprecated department_id for multi-department positions.',
  })
  @Type(() => Number)
  @IsArray()
  @IsInt({ each: true })
  @ArrayUnique()
  @IsOptional()
  department_ids?: number[];

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  reports_to_position_id?: number;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  level?: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_manager?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  headcount?: number;

  @ApiPropertyOptional({ default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ default: 'active' })
  @IsString()
  @IsOptional()
  status?: string;
}
