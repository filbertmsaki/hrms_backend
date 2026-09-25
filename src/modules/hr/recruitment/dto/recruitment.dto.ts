import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEmail, IsIn, IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class CreateRecruitmentRequestDto {
  @Type(() => Number) @IsInt() position_id: number;
  @Type(() => Number) @IsInt() manager_employee_id: number;
  @Type(() => Number) @IsInt() @Min(1) vacancies: number;
  @IsNumberString() budget_amount: string;
  @IsString() @IsNotEmpty() job_title: string;
  @IsString() @IsNotEmpty() job_description: string;
  @IsOptional() @IsDateString() closes_on?: string;
}

export class CreateRecruitmentCandidateDto {
  @IsString() @IsNotEmpty() first_name: string;
  @IsString() @IsNotEmpty() last_name: string;
  @IsIn(['male', 'female']) gender: string;
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() phone: string;
}

export class RecruitmentInterviewDto {
  @IsDateString() scheduled_at: string;
  @IsString() @IsNotEmpty() location: string;
  @IsArray() @IsInt({ each: true }) panel_company_user_ids: number[];
}

export class RecruitmentScoreDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(100) score: number;
  @IsString() @IsNotEmpty() comments: string;
}

export class RecruitmentCheckDto {
  @IsIn(['REFERENCE', 'CERTIFICATE', 'NIDA']) type: 'REFERENCE' | 'CERTIFICATE' | 'NIDA';
  @IsIn(['PASS', 'FAIL']) result: 'PASS' | 'FAIL';
  @IsString() @IsNotEmpty() evidence_note: string;
}

export class RecruitmentOfferDto {
  @IsNumberString() salary: string;
  @IsDateString() start_date: string;
}

export class ConvertCandidateDto {
  @Type(() => Number) @IsInt() onboarding_workflow_id: number;
}

export class AcceptRecruitmentOfferDto {
  @IsString() @IsNotEmpty() token: string;
}
