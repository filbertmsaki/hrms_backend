import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProfileUpdateRequestDto {
  @ApiProperty({ example: 'phone_number' })
  @IsString()
  @MaxLength(100)
  field_name: string;

  @ApiPropertyOptional({ example: '+255 712 000 000' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  current_value?: string | null;

  @ApiProperty({ example: '+255 712 999 999' })
  @IsString()
  @MaxLength(1000)
  requested_value: string;

  @ApiPropertyOptional({ example: 'Updated phone number after SIM swap' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}
