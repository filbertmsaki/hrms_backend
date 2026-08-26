import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  Matches,
  MinLength,
} from 'class-validator';
import {
  TANZANIA_OR_UGANDA_PHONE_CANONICAL_REGEX,
  normalizeTanzaniaOrUgandaPhone,
} from '../../../common/utils/tanzania-phone.util';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value as unknown;
    return value.trim();
  })
  company_name: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value as unknown;
    return value.trim();
  })
  company_slug?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value as unknown;
    const trimmed = value.trim();
    return trimmed
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  })
  @Matches(/^[A-Za-z\s]+$/, {
    message: 'Administrator first name can only contain letters and spaces',
  })
  admin_first_name: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value as unknown;
    const trimmed = value.trim();
    return trimmed
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  })
  @Matches(/^[A-Za-z\s]+$/, {
    message: 'Administrator last name can only contain letters and spaces',
  })
  admin_last_name: string;

  @IsEmail()
  @IsNotEmpty()
  admin_email: string;

  @IsString()
  @IsNotEmpty({ message: 'Administrator phone number is required' })
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value as unknown;
    return (
      normalizeTanzaniaOrUgandaPhone(value) ?? value.replace(/\s+/g, '').trim()
    );
  })
  @Matches(TANZANIA_OR_UGANDA_PHONE_CANONICAL_REGEX, {
    message:
      'Phone number must be a valid Tanzanian (+255) or Ugandan (+256) number, for example +255762650393 or +256772123456',
  })
  admin_phone: string;

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
  admin_password: string;
}
