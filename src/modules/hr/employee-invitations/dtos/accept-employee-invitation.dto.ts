import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';

export class AcceptEmployeeInvitationDto {
  @ApiProperty({ example: 'StrongPass#2026' })
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
        'Password must be at least 8 characters long and contain an uppercase letter, lowercase letter, number, and special character',
    },
  )
  password: string;
}
