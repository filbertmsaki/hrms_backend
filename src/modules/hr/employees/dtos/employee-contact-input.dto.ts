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
  TANZANIA_OR_UGANDA_PHONE_CANONICAL_REGEX,
  normalizeTanzaniaOrUgandaPhone,
} from '../../../../common/utils/tanzania-phone.util';

export class EmployeeContactInputDto {
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
    return normalizeTanzaniaOrUgandaPhone(value) ?? value.trim();
  })
  @Matches(TANZANIA_OR_UGANDA_PHONE_CANONICAL_REGEX, {
    message:
      'Phone number must be a valid Tanzanian (+255) or Ugandan (+256) number, for example +255762650393 or +256772123456',
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
