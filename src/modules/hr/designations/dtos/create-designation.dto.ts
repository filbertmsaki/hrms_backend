import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDesignationDto {
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
  department_id?: number;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  hierarchy_level?: number;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  grade_level?: number;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_managerial?: boolean;

  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ default: 'active' })
  @IsString()
  @IsOptional()
  status?: string;
}
