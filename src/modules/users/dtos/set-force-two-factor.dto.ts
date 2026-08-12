import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetForceTwoFactorDto {
  @ApiProperty({
    description:
      'Whether two-factor authentication is mandatory for this user. When true, the user must complete 2FA setup before accessing the system.',
    example: true,
  })
  @IsBoolean()
  force: boolean;
}
