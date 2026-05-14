import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class Complete2FALoginDto {
  @ApiProperty({
    description: 'Temporary token returned by login before 2FA is completed.',
    example: 'temp_2fa_token_eyJhbGciOiJIUzI1NiJ9',
  })
  @IsString()
  @IsNotEmpty({ message: 'Temporary token is required' })
  tempToken: string;

  @ApiProperty({
    description: 'Authenticator app code or backup code.',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty({ message: '2FA code is required' })
  @Matches(/^(\d{6}|[A-Fa-f0-9]{10}|[A-Fa-f0-9]{5}-[A-Fa-f0-9]{5})$/, {
    message: '2FA code must be a 6-digit authenticator code or a backup code',
  })
  code: string;
}
