import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

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

  /** Stored in the document metadata; an empty string clears it. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsDateString()
  expiry_date?: string;
}
