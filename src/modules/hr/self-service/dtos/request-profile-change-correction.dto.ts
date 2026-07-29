import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestProfileChangeCorrectionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  correction_instructions: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}
