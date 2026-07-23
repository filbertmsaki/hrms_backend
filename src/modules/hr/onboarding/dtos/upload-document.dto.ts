import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';

export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  document_type?: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDefined()
  @Type(() => Base64FileDto)
  @ValidateNested()
  file: Base64FileDto;

  @IsOptional()
  @IsDateString()
  expiry_date?: string;
}
