import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  Matches,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  TANZANIA_OR_UGANDA_PHONE_CANONICAL_REGEX,
  normalizeTanzaniaOrUgandaPhone,
} from '../../../../common/utils/tanzania-phone.util';

export class EmployeeRelativeInputDto {
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @IsString()
  @IsNotEmpty()
  relationship: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value as unknown;
    return normalizeTanzaniaOrUgandaPhone(value) ?? value.trim();
  })
  @Matches(TANZANIA_OR_UGANDA_PHONE_CANONICAL_REGEX, {
    message:
      'Phone number must be a valid Tanzanian (+255) or Ugandan (+256) number, for example +255762650393 or +256772123456',
  })
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  occupation?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_emergency_contact?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}
