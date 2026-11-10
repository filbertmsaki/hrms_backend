import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';
import { EmploymentContractType } from '../entities/employment-contract.entity';
import { ContractSectionDto } from './create-employment-contract.dto';

const SHA256 = /^[0-9a-f]{64}$/;

export class SendContractDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigned_signatory_id?: number;
}

export class SignatureInputDto {
  @IsIn(['TYPED', 'DRAWN'])
  kind: 'TYPED' | 'DRAWN';

  @ValidateIf((dto: SignatureInputDto) => dto.kind === 'TYPED')
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  text?: string;

  /** PNG, base64 (optionally a data URL), max ~200 KB. */
  @ValidateIf((dto: SignatureInputDto) => dto.kind === 'DRAWN')
  @IsString()
  @IsNotEmpty()
  @MaxLength(280_000)
  png_base64?: string;
}

export class SignContractDto {
  @Matches(SHA256, { message: 'document_sha256 must be a SHA-256 hex digest' })
  document_sha256: string;

  @ValidateNested()
  @Type(() => SignatureInputDto)
  signature: SignatureInputDto;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code: string;

  @Equals(true, { message: 'You must agree before signing' })
  consent: boolean;
}

export class SignedUploadDto {
  @ValidateNested()
  @Type(() => Base64FileDto)
  file: Base64FileDto;

  @Matches(SHA256, { message: 'document_sha256 must be a SHA-256 hex digest' })
  document_sha256: string;

  /** HR uploading the company-signed copy on the signatory's behalf. */
  @IsOptional()
  @IsBoolean()
  attest_on_behalf?: boolean;
}

export class VerifyUploadDto {
  @IsIn(['ACCEPT', 'REJECT'])
  outcome: 'ACCEPT' | 'REJECT';

  @ValidateIf((dto: VerifyUploadDto) => dto.outcome === 'REJECT')
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}

export class ReassignSignatoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  signatory_id: number;
}

export class RenewContractDto {
  @IsIn(['RENEWAL', 'AMENDMENT'])
  kind: 'RENEWAL' | 'AMENDMENT';

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;

  @IsOptional()
  @IsEnum(EmploymentContractType)
  contract_type?: EmploymentContractType;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  source_movement_id?: number;
}

export class UpsertContractTemplateDto {
  @IsEnum(EmploymentContractType)
  contract_type: EmploymentContractType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title: string;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ContractSectionDto)
  sections: ContractSectionDto[];
}

export class UpdateCompanyLegalDto {
  @IsOptional() @IsString() @MaxLength(200) legal_name?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(100) registration_number?: string;
  @IsOptional() @IsString() @MaxLength(50) tin?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional()
  @ValidateIf((dto: UpdateCompanyLegalDto) => !!dto.email)
  @IsEmail()
  email?: string;
}

export class SignatoryRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  signatory_id: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  grade_ids?: number[];
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  position_ids?: number[];
  @IsOptional() @IsString() @MaxLength(120) label?: string;
}

export class UpdateContractSettingsDto {
  @IsOptional() @IsBoolean() digital_signing_enabled?: boolean;
  @IsOptional() @IsBoolean() paper_signing_enabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) default_signatory_id?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) backup_signatory_id?:
    | number
    | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SignatoryRuleDto)
  signatory_rules?: SignatoryRuleDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  annual_leave_days?: number;
  @IsOptional() @IsString() @MaxLength(300) notice_period?: string;
  @IsOptional() @IsString() @MaxLength(300) governing_law?: string;
}

export class CreateSignatoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @IsOptional() @IsString() @MaxLength(200) display_name?: string;
  @IsOptional() @IsString() @MaxLength(200) job_title?: string;
  @IsOptional() @IsString() @MaxLength(300) scope_note?: string;
}

export class UpdateSignatoryDto {
  @IsOptional() @IsString() @MaxLength(200) display_name?: string;
  @IsOptional() @IsString() @MaxLength(200) job_title?: string;
  @IsOptional() @IsString() @MaxLength(300) scope_note?: string;
}

export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class AcknowledgePayrollContractWarningsDto {
  @Matches(SHA256)
  warnings_hash: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
