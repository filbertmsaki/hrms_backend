import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateKpiTemplateItemDto {
  @IsInt()
  kpi_definition_version_id: number;

  @IsNumber()
  weight: number;

  @IsOptional()
  @IsNumber()
  target_value?: number;

  @IsOptional()
  @IsBoolean()
  manual_entry_allowed?: boolean;

  @IsOptional()
  @IsBoolean()
  evidence_required?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateKpiTemplateDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  review_cycle?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  applicable_role_ids?: number[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateKpiTemplateItemDto)
  items: CreateKpiTemplateItemDto[];
}
