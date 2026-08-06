import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class ModeratePerformanceReviewDto {
  @IsOptional()
  @IsNumber()
  final_score?: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsObject()
  snapshot?: Record<string, unknown>;
}
