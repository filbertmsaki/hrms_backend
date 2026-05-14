import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password for verification.',
    example: 'OldP@ssw0rd#2025',
  })
  @IsNotEmpty()
  old_password: string;

  @ApiProperty({
    description: 'New password (minimum 8 characters).',
    example: 'NewP@ssw0rd#2026',
    minLength: 8,
  })
  @IsNotEmpty()
  @MinLength(8)
  new_password: string;
}
