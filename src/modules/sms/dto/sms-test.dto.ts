import { Transform, TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import {
  TANZANIA_PHONE_CANONICAL_REGEX,
  normalizeTanzaniaPhone,
} from '../../../common/utils/tanzania-phone.util';

export class SendTestSmsDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value as unknown;
    return normalizeTanzaniaPhone(value) ?? value.trim();
  })
  @Matches(TANZANIA_PHONE_CANONICAL_REGEX, {
    message:
      'Recipient phone number must be a valid Tanzanian number in +255 format, for example +255762650393',
  })
  recipient_phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;
}
