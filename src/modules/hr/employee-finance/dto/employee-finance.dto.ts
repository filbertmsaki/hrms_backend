import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import { Base64FileDto } from '../../../files/dtos/base64-file.dto';
import {
  EmployeeFinanceApprovalStageEnum,
  EmployeeFinanceInterestMethodEnum,
  EmployeeFinanceProductTypeEnum,
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
