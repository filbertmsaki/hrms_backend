import { IsOptional, IsString } from 'class-validator';

export class DeclinePerformanceFeedback360Dto {
  @IsOptional()
  @IsString()
  reason?: string;
}
