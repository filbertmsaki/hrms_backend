import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { EmploymentLetterType } from '../entities/employment-letter-template.entity';

export class UpsertEmploymentLetterTemplateDto {
  @IsEnum(EmploymentLetterType)
  letter_type: EmploymentLetterType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(12000)
  body: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  signatory_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  signatory_title: string;
}
