import { Type } from 'class-transformer';
import {
  IsString,
  IsUrl,
  Length,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';

class WebPushKeysDto {
  @IsString()
  @Length(20, 255)
  @Matches(/^[A-Za-z0-9_-]+$/)
  p256dh: string;

  @IsString()
  @Length(16, 255)
  @Matches(/^[A-Za-z0-9_-]+$/)
  auth: string;
}

export class WebPushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint: string;

  @ValidateNested()
  @Type(() => WebPushKeysDto)
  keys: WebPushKeysDto;
}

export class DeleteWebPushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint: string;
}
