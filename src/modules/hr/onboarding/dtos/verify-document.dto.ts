import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class VerifyDocumentDto {
  @Type(() => Boolean)
  @IsOptional()
  @IsBoolean()
  is_verified?: boolean;

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  review_comment?: string;
}
