import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
  @ApiProperty({
    description: 'Email that should receive a new verification link.',
    example: 'amina.moshi@acme.co.tz',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
