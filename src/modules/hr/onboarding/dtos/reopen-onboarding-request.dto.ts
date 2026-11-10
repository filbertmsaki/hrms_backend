import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReopenOnboardingRequestDto {
  @ApiPropertyOptional({
    description: 'Why the rejected request is being reopened',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
