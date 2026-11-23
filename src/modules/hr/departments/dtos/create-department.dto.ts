import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  Min,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  branch_id?: number;

  @ApiPropertyOptional({ type: Number })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  parent_id?: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  manager_employee_id?: number | null;

  @ApiPropertyOptional({ default: 'active' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    type: [Number],
    description:
      'Existing position IDs to assign to this department. On update, replaces the full set of assignments; a position removed from this list is unassigned unless employees currently depend on it, in which case the request fails.',
  })
  @Type(() => Number)
  @IsArray()
  @IsInt({ each: true })
  @ArrayUnique()
  @IsOptional()
  position_ids?: number[];
}
