import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ManagerCompetencyRatingDto {
  @IsString()
  @MaxLength(60)
  template_item_code: string;

  @IsNumber()
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class SubmitManagerReviewDto {
  @IsOptional()
  @IsObject()
  review?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManagerCompetencyRatingDto)
  competency_ratings?: ManagerCompetencyRatingDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areas_of_strength?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  areas_for_improvement?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  training_needs?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendations?: string[];
}
