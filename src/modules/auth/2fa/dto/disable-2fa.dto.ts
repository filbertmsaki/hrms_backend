import { IsNotEmpty, IsString, Length } from 'class-validator';

export class Disable2FaDto {
  @IsNotEmpty({ message: 'Token is required' })
  @IsString()
  @Length(6, 6, { message: '2FA code must be exactly 6 digits' })
  token: string;
}
