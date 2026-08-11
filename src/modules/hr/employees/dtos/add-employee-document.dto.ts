import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';

const DOCUMENT_CLASSIFICATIONS = ['PRIVATE', 'CONFIDENTIAL', 'RESTRICTED'];

export class AddEmployeeDocumentDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  type?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  title?: string;

  @IsString()
  @IsOptional()
  @IsIn(DOCUMENT_CLASSIFICATIONS)
  classification?: string;

  @IsDefined()
  @Type(() => Base64FileDto)
  @ValidateNested()
  file: Base64FileDto;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  retention_until?: string;
}
