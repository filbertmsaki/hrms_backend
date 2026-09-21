import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SubmitPerformanceFeedback360Dto {
  @IsObject()
  ratings: Record<string, number>;

  @IsNumber()
  @Min(0)
  @Max(100)
  overall_score: number;

  @IsOptional()
  @IsString()
  strengths?: string;

  @IsOptional()
  @IsString()
  improvement_areas?: string;

  @IsOptional()
  @IsString()
  comments?: string;
}
