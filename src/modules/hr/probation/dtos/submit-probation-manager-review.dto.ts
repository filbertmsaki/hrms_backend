import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ProbationManagerRecommendationEnum } from '../enums/probation-manager-recommendation.enum';

export class ProbationManagerRatingDto {
  @IsString()
  criterion_code: string;

  @IsNumber()
  @Min(0)
  rating: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comment?: string;
}

export class ProbationObjectiveManagerReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  objective_id: number;

  @IsNumber()
  @Min(0)
  rating: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comment?: string;
}

export class SubmitProbationManagerReviewDto {
  @ApiPropertyOptional({ type: [ProbationManagerRatingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbationManagerRatingDto)
  ratings: ProbationManagerRatingDto[];

  @ApiPropertyOptional({ type: [ProbationObjectiveManagerReviewDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbationObjectiveManagerReviewDto)
  @IsOptional()
  objectives?: ProbationObjectiveManagerReviewDto[];

  @IsEnum(ProbationManagerRecommendationEnum)
  recommendation: ProbationManagerRecommendationEnum;

  @IsString()
  @MaxLength(4000)
  comments: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  recommended_extension_days?: number;
}
