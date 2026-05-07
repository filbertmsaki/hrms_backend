import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddEmployeeDocumentDto {
  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  file_url: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
