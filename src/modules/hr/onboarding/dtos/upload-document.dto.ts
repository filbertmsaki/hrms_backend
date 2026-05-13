import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @IsString()
  @MaxLength(255)
  file_name: string;

  @IsString()
  @MaxLength(255)
  original_file_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  mime_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  file_extension?: string;

  @IsOptional()
  @IsString()
  file_size?: string;

  @IsString()
  @MaxLength(3000)
  file_path: string;

  @IsOptional()
  @IsDateString()
  expiry_date?: string;
}
