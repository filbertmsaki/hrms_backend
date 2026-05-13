import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOnboardingRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
