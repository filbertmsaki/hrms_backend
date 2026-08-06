import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreatePerformanceRatingBandDto {
  @IsString()
  @MaxLength(40)
  code: string;

  @IsString()
  @MaxLength(100)
  label: string;

  @IsNumber()
  minimum_score: number;

  @IsNumber()
  maximum_score: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  display_order?: number;

  @IsOptional()
  @IsBoolean()
  requires_improvement_plan?: boolean;
}

export class CreatePerformanceRatingScaleDto {
  @IsString()
  @MaxLength(60)
  code: string;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsNumber()
  minimum_score?: number;

  @IsOptional()
  @IsNumber()
  maximum_score?: number;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePerformanceRatingBandDto)
  bands: CreatePerformanceRatingBandDto[];
}
