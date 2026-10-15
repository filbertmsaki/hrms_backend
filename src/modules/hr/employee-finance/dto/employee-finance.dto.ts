import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';
import {
  EmployeeFinanceAdjustmentTypeEnum,
  EmployeeFinanceApprovalStageEnum,
  EmployeeFinanceDecisionEnum,
  EmployeeFinanceInterestMethodEnum,
  EmployeeFinanceProductTypeEnum,
  EmployeeFinanceRequestStatusEnum,
  EmployeeFinanceShortfallResolutionEnum,
} from '../employee-finance.enums';

export class EmployeeFinanceQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  employee_id?: number;

  @IsOptional()
  @Type(() => Number)
  product_id?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsString()
  entity_type?: string;

  @IsOptional()
  @IsString()
  entity_id?: string;
}

export class CreateEmployeeFinanceProductDto {
  @IsEnum(EmployeeFinanceProductTypeEnum)
  product_type: EmployeeFinanceProductTypeEnum;

  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(EmployeeFinanceInterestMethodEnum)
  interest_method?: EmployeeFinanceInterestMethodEnum;

  @IsOptional()
  @IsString()
  annual_interest_rate?: string;

  /** NONE, FLAT (amount), or PERCENT (of principal); collected with the first instalment. */
  @IsOptional()
  @IsString()
  processing_fee_method?: string;

  @IsOptional()
  @IsString()
  processing_fee_value?: string;

  @IsString()
  minimum_amount: string;

  @IsOptional()
  @IsString()
  maximum_amount?: string;

  @IsOptional()
  @IsString()
  maximum_salary_multiple?: string;

  @IsOptional()
  @Type(() => Number)
  minimum_term_months?: number;

  @Type(() => Number)
  @IsNumber()
  maximum_term_months: number;

  @IsOptional()
  @Type(() => Number)
  minimum_service_months?: number;

  @IsOptional()
  @IsString()
  maximum_installment_percentage?: string;

  @IsOptional()
  @Type(() => Number)
  maximum_active_accounts?: number;

  @IsOptional()
  @IsBoolean()
  requires_confirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_during_probation?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_rescheduling?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_deferment?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_early_settlement?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_additional_repayment?: boolean;

  @IsOptional()
  @IsArray()
  required_document_types?: string[];

  @IsOptional()
  eligibility_configuration?: Record<string, unknown>;

  @IsOptional()
  approval_configuration?: Record<string, unknown>;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;
}

export class EvaluateEmployeeFinanceEligibilityDto {
  @Type(() => Number)
  @IsNumber()
  employee_id: number;

  @Type(() => Number)
  @IsNumber()
  product_id: number;

  @IsOptional()
  @IsString()
  requested_amount?: string;

  @IsOptional()
  @Type(() => Number)
  requested_term_months?: number;
}

export class EvaluateMyEmployeeFinanceEligibilityDto {
  @Type(() => Number)
  @IsNumber()
  product_id: number;

  @IsOptional()
  @IsString()
  requested_amount?: string;

  @IsOptional()
  @Type(() => Number)
  requested_term_months?: number;
}

export class CreateEmployeeFinanceApplicationDto {
  @Type(() => Number)
  @IsNumber()
  product_id: number;

  @IsString()
  requested_amount: string;

  @Type(() => Number)
  @IsNumber()
  requested_term_months: number;

  @IsString()
  purpose: string;
}

export class CreateEmployeeFinanceApplicationDocumentDto {
  @IsString()
  document_type: string;

  @IsOptional()
  @Type(() => Number)
  document_id?: number;

  @IsOptional()
  @IsString()
  file_url?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UploadEmployeeFinanceApplicationDocumentDto {
  @IsString()
  document_type: string;

  @Type(() => Base64FileDto)
  file: Base64FileDto;

  @IsOptional()
  @IsDateString()
  expires_on?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class VerifyEmployeeFinanceApplicationDocumentDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreateEmployeeFinanceGuarantorDto {
  @Type(() => Number)
  @IsNumber()
  guarantor_employee_id: number;
}

export class DecideEmployeeFinanceGuarantorDto {
  @IsString()
  decision: string;

  @IsOptional()
  @IsString()
  comments?: string;
}

export class ApproveEmployeeFinanceApplicationDto {
  @IsEnum(EmployeeFinanceApprovalStageEnum)
  stage: EmployeeFinanceApprovalStageEnum;

  @IsString()
  snapshot_hash: string;

  @IsOptional()
  @IsString()
  approved_amount?: string;

  @IsOptional()
  @Type(() => Number)
  approved_term_months?: number;

  @IsOptional()
  @IsString()
  comments?: string;
}

export class CreateEmployeeFinanceDisbursementDto {
  @Type(() => Number)
  @IsNumber()
  account_id: number;

  @IsString()
  amount: string;

  @IsString()
  payment_reference: string;

  @IsDateString()
  payment_date: string;
}

export class CreateEmployeeFinanceRepaymentDto {
  @Type(() => Number)
  @IsNumber()
  account_id: number;

  @IsString()
  amount: string;

  @IsOptional()
  @IsString()
  payment_reference?: string;

  @IsDateString()
  payment_date: string;

  @IsOptional()
  @IsString()
  repayment_type?: string;
}

export class RequestEmployeeFinanceDefermentDto {
  @Type(() => Number)
  @IsNumber()
  installment_id: number;

  @IsString()
  reason: string;
}

export class RequestEmployeeFinanceRescheduleDto {
  @Type(() => Number)
  @IsNumber()
  new_term_months: number;

  @IsString()
  reason: string;
}

export class ImportEmployeeFinancePaymentFileDto {
  @Type(() => Base64FileDto)
  file: Base64FileDto;

  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;
}

export class UpdateEmployeeFinanceApplicationDto {
  @IsOptional()
  @IsString()
  requested_amount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requested_term_months?: number;

  @IsOptional()
  @IsString()
  purpose?: string;
}

export class DecideEmployeeFinanceApplicationDto {
  @IsEnum(EmployeeFinanceApprovalStageEnum)
  stage: EmployeeFinanceApprovalStageEnum;

  /** REJECTED ends the application; RETURNED sends it back for correction. */
  @IsIn([
    EmployeeFinanceDecisionEnum.REJECTED,
    EmployeeFinanceDecisionEnum.RETURNED,
  ])
  decision: EmployeeFinanceDecisionEnum;

  @IsString()
  @MaxLength(2000)
  comments: string;
}

export class DelegatedEmployeeFinanceDecisionDto {
  @IsEnum(EmployeeFinanceApprovalStageEnum)
  stage: EmployeeFinanceApprovalStageEnum;

  @IsIn([
    EmployeeFinanceDecisionEnum.APPROVED,
    EmployeeFinanceDecisionEnum.REJECTED,
    EmployeeFinanceDecisionEnum.RETURNED,
  ])
  decision: EmployeeFinanceDecisionEnum;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  delegation_id?: number;

  @IsOptional()
  @IsString()
  snapshot_hash?: string;

  @IsOptional()
  @IsString()
  approved_amount?: string;

  @IsOptional()
  @Type(() => Number)
  approved_term_months?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}

export class CreateEmployeeFinanceDelegationDto {
  @Type(() => Number)
  @IsInt()
  delegate_company_user_id: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  stages: string[];

  @IsDateString()
  starts_on: string;

  @IsDateString()
  ends_on: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class UpsertEmployeeFinanceLetterTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsString()
  letterhead: string;

  @IsString()
  body: string;

  @IsString()
  @MaxLength(180)
  signatory_name: string;

  @IsString()
  @MaxLength(180)
  signatory_title: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class PreviewEmployeeFinanceLetterTemplateDto {
  @IsString()
  body: string;
}

export class DecideEmployeeFinanceServicingRequestDto {
  @IsIn([
    EmployeeFinanceRequestStatusEnum.APPROVED,
    EmployeeFinanceRequestStatusEnum.REJECTED,
  ])
  decision: EmployeeFinanceRequestStatusEnum;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}

export class SettleEmployeeFinanceQuoteDto {
  @IsString()
  payment_reference: string;

  @IsDateString()
  payment_date: string;
}

export class ConfirmEmployeeFinanceExitRecoveryDto {
  @IsString()
  amount: string;

  @IsOptional()
  @IsString()
  payment_reference?: string;

  @IsOptional()
  @IsDateString()
  payment_date?: string;
}

export class CancelEmployeeFinanceDisbursementDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CreateEmployeeFinanceAdjustmentDto {
  @IsIn(Object.values(EmployeeFinanceAdjustmentTypeEnum))
  adjustment_type: EmployeeFinanceAdjustmentTypeEnum;

  /** Penalty or waiver amount; ignored for write-offs, which clear the whole balance. */
  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  installment_id?: number;

  @IsString()
  @MaxLength(2000)
  reason: string;
}

export class ResolveEmployeeFinanceShortfallDto {
  @IsIn(Object.values(EmployeeFinanceShortfallResolutionEnum))
  resolution: EmployeeFinanceShortfallResolutionEnum;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  payment_reference?: string;

  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  new_term_months?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}

export class EmployeeFinancePayrollPreviewQueryDto {
  @Type(() => Number)
  @IsInt()
  payroll_period_id: number;
}

export class MarkEmployeeFinanceOverdueDto {
  @IsOptional()
  @IsDateString()
  as_of?: string;
}

export class UpdateEmployeeFinanceIntegrationSettingsDto {
  @IsOptional()
  @IsString()
  erp_mode?: string;

  @IsOptional()
  @IsString()
  erp_provider?: string;

  @IsOptional()
  @IsString()
  erp_environment?: string;

  @IsOptional()
  @IsString()
  erp_endpoint_url?: string | null;

  @IsOptional()
  @IsString()
  erp_auth_type?: string;

  /** Write-only; {} clears, omitted keeps the stored credentials. */
  @IsOptional()
  erp_credentials?: Record<string, string> | null;

  @IsOptional()
  @IsString()
  bank_mode?: string;

  @IsOptional()
  @IsString()
  bank_provider?: string;

  @IsOptional()
  @IsString()
  bank_environment?: string;

  @IsOptional()
  @IsString()
  bank_endpoint_url?: string | null;

  @IsOptional()
  @IsString()
  bank_auth_type?: string;

  @IsOptional()
  bank_credentials?: Record<string, string> | null;

  @IsOptional()
  @IsString()
  debit_account_number?: string | null;

  @IsOptional()
  bank_file_template?: Record<string, unknown> | null;

  @IsOptional()
  bank_import_mapping?: Record<string, unknown> | null;

  @IsOptional()
  gl_mapping?: Record<string, unknown> | null;
}

export class EmployeeFinanceJournalQueryDto {
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  /** Defaults to true: skip postings already exported or posted. */
  @IsOptional()
  @Type(() => String)
  only_unexported?: string;

  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  format?: string;
}

export class EmployeeFinancePaymentBatchDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  disbursement_ids?: number[];
}

export class ImportEmployeeFinanceMigrationDto {
  @Type(() => Base64FileDto)
  file: Base64FileDto;

  /** Defaults to true; nothing is saved until a run with dry_run false passes every row. */
  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;

  @IsOptional()
  @IsDateString()
  cutover_date?: string;
}

export class SignOffEmployeeFinanceMigrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}

export class PostEmployeeFinanceAccountingDto {
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;
}
