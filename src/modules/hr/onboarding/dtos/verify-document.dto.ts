import { Type } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class VerifyDocumentDto {
  @Type(() => Boolean)
  @IsBoolean()
  is_verified: boolean;
}
