import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AcknowledgeOnboardingDto {
  @Type(() => Boolean)
  @IsBoolean()
  accepted: boolean;

  @IsString()
  @MaxLength(50)
  acknowledgement_version: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  acknowledgement_document_id?: number;
}
