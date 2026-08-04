import { IsDateString, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';

export class UploadDocumentDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  document_type_code?: string;

  @IsDateString()
  @IsOptional()
  expiry_date?: string;

  @ValidateNested()
  @Type(() => Base64FileDto)
  file: Base64FileDto;
}
