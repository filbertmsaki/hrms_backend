import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  EmploymentContractStatus,
  EmploymentContractType,
} from '../entities/employment-contract.entity';

export class ContractSectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  heading: string;

  @IsString()
  @MaxLength(20000)
  body: string;
}

/**
 * Creates a DRAFT. Values already held in HR records (name, sex, position,
 * department, manager, salary) are pre-filled server-side; fields here only
 * override or add contract-specific terms. Completeness is enforced at send.
 */
export class CreateEmploymentContractDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @IsEnum(EmploymentContractType)
  contract_type: EmploymentContractType;

  @IsDateString()
  start_date: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24)
  probation_months?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  job_title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  work_location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  hours_of_work?: string;

  @IsOptional()
  @IsNumberString()
  salary_amount?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  salary_currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pay_frequency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  benefits?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => ContractSectionDto)
  sections?: ContractSectionDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigned_signatory_id?: number;

  /** Duplicate content from an earlier (e.g. cancelled) contract of the same employee. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  from_contract_id?: number;

  // ── ELRA s.15 particulars (legacy form fields; optional, pre-filled where possible) ──

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(18)
  employee_age?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  permanent_address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  place_of_recruitment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  job_description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  place_of_work?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remuneration?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remuneration_method?: string;

  /**
   * Per-contract values for template fields ({{token}} → text). An empty
   * string removes the override so the automatic value is used again.
   */
  @IsOptional()
  @IsObject()
  field_overrides?: Record<string, string>;
}

export class UpdateEmploymentContractDto extends PartialType(
  OmitType(CreateEmploymentContractDto, ['employee_id', 'from_contract_id']),
) {
  /** Optimistic concurrency: the `updatedAt` the editor loaded. */
  @IsDateString()
  expected_updated_at: string;
}

export class CancelEmploymentContractDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class ListEmploymentContractsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(EmploymentContractStatus)
  status?: EmploymentContractStatus;

  @IsOptional()
  @IsIn([
    'NOT_EFFECTIVE',
    'NOT_STARTED',
    'ACTIVE',
    'EXPIRING',
    'EXPIRED',
    'SUPERSEDED',
    'TERMINATED',
  ])
  validity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  signatory_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
