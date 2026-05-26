import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { AccessGroupStatusEnum } from '../enum/access-group-status.enum';

export class CreateAccessGroupDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  branch_id?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  schedule_template_id: number;

  @ApiPropertyOptional({ enum: AccessGroupStatusEnum })
  @IsEnum(AccessGroupStatusEnum)
  @IsOptional()
  status?: AccessGroupStatusEnum;

  @ApiPropertyOptional({ description: 'Arbitrary metadata JSON object' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
