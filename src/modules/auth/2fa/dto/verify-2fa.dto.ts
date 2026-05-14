import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class Verify2FaDto {
  @ApiProperty({
    description: 'Authenticator app code or backup code.',
    example: '123456',
  })
  @IsNotEmpty({ message: 'Code is required' })
  @IsString()
  @Matches(/^(\d{6}|[A-Fa-f0-9]{10}|[A-Fa-f0-9]{5}-[A-Fa-f0-9]{5})$/, {
    message: '2FA code must be a 6-digit authenticator code or a backup code',
  })
  token: string;
}
