import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';

export class AdminResetUserPasswordDto {
  @ApiProperty({
    description:
      'Temporary password the user must change after their next successful login.',
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
