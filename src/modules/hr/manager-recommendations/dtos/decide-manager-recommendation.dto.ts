import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum ManagerRecommendationDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  RETURN = 'RETURN',
}

export class DecideManagerRecommendationDto {
  @IsEnum(ManagerRecommendationDecision)
  decision: ManagerRecommendationDecision;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  comment?: string;
}
