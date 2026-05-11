import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class Complete2FALoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Temporary token is required' })
  tempToken: string;

  @IsString()
  @IsNotEmpty({ message: '2FA code is required' })
  @Matches(/^(\d{6}|[A-Fa-f0-9]{10}|[A-Fa-f0-9]{5}-[A-Fa-f0-9]{5})$/, {
    message: '2FA code must be a 6-digit authenticator code or a backup code',
  })
  code: string;
}
