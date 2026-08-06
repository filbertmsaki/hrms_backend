import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
} from 'class-validator';

export class ApprovePerformanceReviewDto {
  @IsOptional()
  @IsObject()
  hr_review?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  adjustment_score?: number;

  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
