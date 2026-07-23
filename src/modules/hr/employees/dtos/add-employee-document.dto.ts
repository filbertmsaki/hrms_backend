import { Type } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';

export class AddEmployeeDocumentDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  type?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  title?: string;

  @IsDefined()
  @Type(() => Base64FileDto)
  @ValidateNested()
  file: Base64FileDto;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  notes?: string;
}
