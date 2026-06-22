import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProfileUpdateRequestDto {
  @ApiProperty({
    example: { phone_number: '+255 712 999 999', city: 'Dar es Salaam' },
    description:
      'Map of employee profile fields to update. Only allowed fields will be applied on approval.',
  })
  @IsObject()
  requested_changes: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Updated phone number after SIM swap' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;
}
