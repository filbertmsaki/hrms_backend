import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token sent to email.',
    example: '4cf01d4d-d28a-4825-819f-ff9ca4175901',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'New strong password to replace the old password.',
    example: 'N3wP@ssw0rd#2026',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'Password must be at least 8 characters long and contain at least ' +
        'one uppercase letter, one lowercase letter, one number, and one special character.',
    },
  )
  new_password: string;
}
