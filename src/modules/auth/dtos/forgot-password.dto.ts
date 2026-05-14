import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address associated with the account.',
    example: 'amina.moshi@acme.co.tz',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
