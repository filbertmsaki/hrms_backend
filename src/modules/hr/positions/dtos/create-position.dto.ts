import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  department_id?: number;

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
