import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  Matches,
  IsOptional,
  IsString,
} from 'class-validator';
import { ContactTypeEnum } from '../enums/contact-type.enum';
import {
  TANZANIA_PHONE_CANONICAL_REGEX,
  normalizeTanzaniaPhone,
} from '../../../../common/utils/tanzania-phone.util';

export class CreateEmployeeContactDto {
  @ApiPropertyOptional({
    enum: ContactTypeEnum,
    default: ContactTypeEnum.PERSONAL,
  })
  @IsEnum(ContactTypeEnum)
  contact_type: ContactTypeEnum;

  @IsString()
  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value as unknown;
    return normalizeTanzaniaPhone(value) ?? value.trim();
  })
  @Matches(TANZANIA_PHONE_CANONICAL_REGEX, {
    message:
      'Phone number must be a valid Tanzanian number in +255 format, for example +255762650393',
  })
  phone_number?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;

  @ApiPropertyOptional({ default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  is_verified?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}
