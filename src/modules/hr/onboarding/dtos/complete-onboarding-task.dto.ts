import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteOnboardingTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  completion_notes?: string;
}
