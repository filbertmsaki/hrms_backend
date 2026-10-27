import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ManagerRecommendationType } from '../entities/manager-recommendation.entity';

export class CreateManagerRecommendationDto {
  @Type(() => Number)
  @IsInt()
  employee_id: number;

  @IsEnum(ManagerRecommendationType)
  recommendation_type: ManagerRecommendationType;

  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  rationale: string;

  @IsOptional()
  @IsObject()
  proposal?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  proposed_effective_date?: string;
}
