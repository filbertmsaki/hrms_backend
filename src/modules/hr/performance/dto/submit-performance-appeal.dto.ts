import { IsObject, IsOptional, IsString } from 'class-validator';

export class SubmitPerformanceAppealDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsObject()
  requested_changes?: Record<string, unknown>;
}
