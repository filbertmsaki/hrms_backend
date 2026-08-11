import { IsString } from 'class-validator';

export class ReopenPerformanceReviewDto {
  @IsString()
  reason: string;
}
