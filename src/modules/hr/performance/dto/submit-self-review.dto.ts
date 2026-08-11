import { IsObject, IsOptional } from 'class-validator';

export class SubmitSelfReviewDto {
  @IsOptional()
  @IsObject()
  review?: Record<string, unknown>;
}
