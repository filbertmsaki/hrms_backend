import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateEmployeeAcademicQualificationDto {
  @IsString()
  @IsOptional()
  country_of_residence?: string;

  @IsString()
  @IsOptional()
  education_level?: string;

  @IsString()
  @IsOptional()
  institution_name?: string;

  @IsString()
  @IsOptional()
  degree_or_certificate?: string;

  @IsString()
  @IsOptional()
  field_of_study?: string;

  @IsDateString()
  @IsOptional()
  start_date?: string;

  @IsDateString()
  @IsOptional()
  end_date?: string;

  @IsString()
  @IsOptional()
  @Matches(/^https:\/\//i, {
    message: 'academic_certificate_document_url must be an HTTPS URL',
  })
  academic_certificate_document_url?: string;
}
