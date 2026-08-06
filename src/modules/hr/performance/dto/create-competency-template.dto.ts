import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PerformanceCompetencyCategoryEnum } from '../enums/performance-competency-category.enum';

class CreateCompetencyTemplateItemDto {
  @IsString()
  @MaxLength(60)
  code: string;

  @IsString()
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PerformanceCompetencyCategoryEnum)
  category?: PerformanceCompetencyCategoryEnum;

  @IsNumber()
  weight: number;

  @IsOptional()
  @IsNumber()
  maximum_rating?: number;
}

export class CreateCompetencyTemplateDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCompetencyTemplateItemDto)
  items: CreateCompetencyTemplateItemDto[];
}
