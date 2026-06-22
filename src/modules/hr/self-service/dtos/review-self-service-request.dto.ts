import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewSelfServiceRequestDto {
  @ApiPropertyOptional({
    example: 'Approved after verifying biometric device issue.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({ example: { reviewed_from: 'HR_PORTAL' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
