import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsString,
  IsStrongPassword,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  })
  @Matches(/^[A-Za-z\s]+$/, {
    message:
      'First name can only contain letters (no numbers or special characters)',
  })
  first_name: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  })
  @Matches(/^[A-Za-z\s]+$/, {
    message:
      'Last name can only contain letters (no numbers or special characters)',
  })
  last_name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
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
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @Transform(({ value }: TransformFnParams) => {
    if (typeof value !== 'string') return value;
    return value.replace(/\s+/g, '').trim();
  })
  @Matches(/^(0\d{9}|255\d{9}|\+255\d{9})$/, {
    message:
      'Phone number must be valid Tanzanian format: ' +
      '10 digits starting with 0 (e.g. 0712345678), ' +
      'or 12 digits starting with 255 (e.g. 255712345678), ' +
      'or 13 characters starting with +255 (e.g. +255712345678)',
  })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return value.trim().toLowerCase();
  })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Company slug must use lowercase letters, numbers, and hyphens only',
  })
  company_slug: string;

}
