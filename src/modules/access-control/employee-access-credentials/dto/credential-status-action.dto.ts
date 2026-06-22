import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CredentialStatusActionDto {
  @ApiPropertyOptional({ example: 'Card reported lost by employee.' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    example: {
      note: 'Backend lifecycle update only. Device sync handled by device API.',
    },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
