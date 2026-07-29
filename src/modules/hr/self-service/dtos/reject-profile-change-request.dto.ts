import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectProfileChangeRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  rejection_reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}
