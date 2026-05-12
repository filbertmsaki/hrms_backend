import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateEmployeeProfessionalQualificationDto {
  @IsString()
  @IsOptional()
  country_of_residence?: string;

  @IsString()
  @IsOptional()
  institution_name?: string;

  @IsString()
  @IsOptional()
  programme_name?: string;

  @IsString()
  @IsOptional()
  issuing_organization?: string;

  @IsDateString()
  @IsOptional()
  issue_date?: string;

  @IsDateString()
  @IsOptional()
  expiry_date?: string;

  @IsString()
  @IsOptional()
  @Matches(/^https:\/\//i, {
    message: 'professional_certificate_document_url must be an HTTPS URL',
  })
  professional_certificate_document_url?: string;
}
