import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectOnboardingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;

  @ApiPropertyOptional({
    description: 'Optional signature URL/reference used during rejection',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  signature_url?: string;
}
