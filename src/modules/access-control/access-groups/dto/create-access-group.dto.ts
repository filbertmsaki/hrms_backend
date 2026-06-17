import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AccessGroupStatusEnum } from '../enum/access-group-status.enum';

export class CreateAccessGroupDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  organization_id?: number | null;

  @IsString()
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(150)
  group_name: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  group_code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number | null;

  @ApiPropertyOptional({ enum: AccessGroupStatusEnum })
  @IsEnum(AccessGroupStatusEnum)
  @IsOptional()
  status?: AccessGroupStatusEnum;

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
