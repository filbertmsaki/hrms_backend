import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateEmployeeAcademicQualificationDto {
  @IsString()
  @IsNotEmpty()
  country_of_residence: string;

  @IsString()
  @IsNotEmpty()
  education_level: string;

  @IsString()
  @IsNotEmpty()
  institution_name: string;

  @IsString()
  @IsNotEmpty()
  degree_or_certificate: string;

  @IsString()
  @IsNotEmpty()
  field_of_study: string;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  // Optional verification link; the certificate itself is uploaded as a
  // document.
  @IsOptional()
  @IsString()
  @Matches(/^https:\/\//i, {
    message: 'academic_certificate_document_url must be an HTTPS URL',
  })
  academic_certificate_document_url?: string;
}
