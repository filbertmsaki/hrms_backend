import { Type } from 'class-transformer';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Min,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Email used to sign in.',
    example: 'amina.moshi@acme.co.tz',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Account password.',
    example: 'P@ssw0rd#2026',
  })
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiHideProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  company_id?: number;
}
