import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Alliance Insurance Corporation' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Alliance Insurance Corporation' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  company_name?: string;

  @ApiPropertyOptional({
    example: {
      timezone: 'Africa/Dar_es_Salaam',
      country: 'Tanzania',
      city: 'Dar es Salaam',
    },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
