import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Metadata an employee may change on a document they uploaded themselves. */
export class UpdateMyEmployeeDocumentDto {
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
  @MaxLength(2000)
  notes?: string;
}
