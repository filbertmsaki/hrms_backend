import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class EmployeeProfessionalQualificationInputDto {
  @IsString()
  @IsNotEmpty()
  country_of_residence: string;

  @IsString()
  @IsNotEmpty()
  institution_name: string;

  @IsString()
  @IsNotEmpty()
  programme_name: string;

  @IsString()
  @IsNotEmpty()
  issuing_organization: string;

  @IsDateString()
  issue_date: string;

  @IsDateString()
  @IsOptional()
  expiry_date?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^https:\/\//i, {
    message: 'professional_certificate_document_url must be an HTTPS URL',
  })
  professional_certificate_document_url: string;
}
