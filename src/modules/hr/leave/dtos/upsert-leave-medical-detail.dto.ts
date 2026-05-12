import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertLeaveMedicalDetailDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  sickness_nature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  doctor_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  doctor_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  hospital_name?: string;

  @IsOptional()
  @IsDateString()
  treatment_start_date?: string;

  @IsOptional()
  @IsDateString()
  treatment_end_date?: string;

  @IsOptional()
  @IsString()
  attachment_url?: string;
}
