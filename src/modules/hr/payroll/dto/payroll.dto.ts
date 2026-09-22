import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import {
  PayrollApprovalStageEnum,
  PayrollCalculationMethodEnum,
  PayrollComponentFrequencyEnum,
  PayrollComponentTypeEnum,
  PayrollInputStatusEnum,
  PayrollRunTypeEnum,
  PayrollTaxTreatmentEnum,
  StatutorySchemeTypeEnum,
} from '../payroll.enums';

export class PayrollQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  employee_id?: number;

  @IsOptional()
  @Type(() => Number)
  payroll_period_id?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpsertEmployeePayrollProfileDto {
  @Type(() => Number)
  @IsNumber()
  employee_id: number;

  @IsString()
  payroll_number: string;

  @IsOptional()
  @IsString()
  taxpayer_identification_number?: string;

  @IsOptional()
  @IsString()
  social_security_scheme_code?: string;

  @IsOptional()
  @IsString()
  social_security_number?: string;

  @IsOptional()
  @IsString()
  health_insurance_scheme_code?: string;

  @IsOptional()
  @IsString()
  health_insurance_number?: string;

  @IsOptional()
  @IsString()
  tax_residency_code?: string;

  @IsOptional()
  @IsString()
  employment_tax_category?: string;

  @IsOptional()
  @IsString()
  payment_method?: string;

  @IsOptional()
  @Type(() => Number)
  primary_bank_account_id?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  pay_frequency?: string;

  @IsOptional()
  @IsBoolean()
  payroll_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  payroll_hold?: boolean;

  @IsOptional()
  @IsString()
  payroll_hold_reason?: string;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;
}

export class CreatePayrollComponentDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsEnum(PayrollComponentTypeEnum)
  component_type: PayrollComponentTypeEnum;

  @IsOptional()
  @IsEnum(PayrollComponentFrequencyEnum)
  frequency?: PayrollComponentFrequencyEnum;

  @IsEnum(PayrollCalculationMethodEnum)
  calculation_method: PayrollCalculationMethodEnum;

  @IsOptional()
  @IsEnum(PayrollTaxTreatmentEnum)
  tax_treatment?: PayrollTaxTreatmentEnum;

  @IsOptional()
  @IsString()
  taxable_percentage?: string;

  @IsOptional()
  @IsBoolean()
  pensionable?: boolean;

  @IsOptional()
  @IsBoolean()
  health_insurance_applicable?: boolean;

  @IsOptional()
  @IsBoolean()
  included_in_gross?: boolean;

  @IsOptional()
  @IsBoolean()
  included_in_net?: boolean;

  @IsOptional()
  @IsBoolean()
  included_in_employer_cost?: boolean;

  @IsOptional()
  @IsBoolean()
  subject_to_proration?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_manual_input?: boolean;

  @IsOptional()
  @Type(() => Number)
  calculation_order?: number;

  @IsOptional()
  calculation_configuration?: Record<string, unknown>;
}

export class SalaryStructureComponentDto {
  @Type(() => Number)
  @IsNumber()
  component_id: number;

  @IsOptional()
  @IsString()
  default_amount?: string;

  @IsOptional()
  @IsString()
  default_rate?: string;

  @IsOptional()
  @Type(() => Number)
  calculation_order?: number;

  @IsOptional()
  configuration?: Record<string, unknown>;
}

export class CreateSalaryStructureDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryStructureComponentDto)
  components: SalaryStructureComponentDto[];
}

export class CreatePayrollCalendarDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @Type(() => Number)
  cutoff_day?: number;

  @IsOptional()
  @Type(() => Number)
  payment_day?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class GeneratePayrollPeriodDto {
  @Type(() => Number)
  @IsNumber()
  payroll_calendar_id: number;

  @Type(() => Number)
  @IsNumber()
  year: number;

  @Type(() => Number)
  @IsNumber()
  month: number;
}

export class CreateStatutorySchemeDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsEnum(StatutorySchemeTypeEnum)
  scheme_type: StatutorySchemeTypeEnum;

  @IsOptional()
  @IsString()
  jurisdiction?: string;
}

export class StatutoryTaxBandDto {
  @IsString()
  lower_limit: string;

  @IsOptional()
  @IsString()
  upper_limit?: string;

  @IsOptional()
  @IsString()
  base_tax?: string;

  @IsString()
  rate_percent: string;

  @IsOptional()
  @Type(() => Number)
  sort_order?: number;
}

export class CreateStatutoryRuleDto {
  @Type(() => Number)
  @IsNumber()
  scheme_id: number;

  @Type(() => Number)
  @IsNumber()
  version_number: number;

  @IsEnum(PayrollCalculationMethodEnum)
  calculation_method: PayrollCalculationMethodEnum;

  @IsOptional()
  @IsString()
  employee_rate?: string;

  @IsOptional()
  @IsString()
  employer_rate?: string;

  @IsOptional()
  @IsString()
  maximum_basis?: string;

  @IsOptional()
  @IsBoolean()
  deduct_employee_before_tax?: boolean;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @IsOptional()
  configuration?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatutoryTaxBandDto)
  bands?: StatutoryTaxBandDto[];
}

export class CreatePayrollInputDto {
  @Type(() => Number)
  @IsNumber()
  payroll_period_id: number;

  @IsOptional()
  @Type(() => Number)
  employee_id?: number;

  @IsString()
  component_code: string;

  @IsOptional()
  @IsString()
  source_module?: string;

  @IsOptional()
  @IsString()
  source_reference?: string;

  @IsString()
  amount: string;

  @IsOptional()
  @IsString()
  quantity?: string;

  @IsOptional()
  @IsString()
  rate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(PayrollInputStatusEnum)
  status?: PayrollInputStatusEnum;

  @IsOptional()
  payload?: Record<string, unknown>;
}

export class CreatePayrollRunDto {
  @Type(() => Number)
  @IsNumber()
  payroll_period_id: number;

  @IsOptional()
  @Type(() => Number)
  payroll_group_id?: number;

  @IsOptional()
  @IsEnum(PayrollRunTypeEnum)
  run_type?: PayrollRunTypeEnum;

  @IsOptional()
  @Type(() => Number)
  parent_run_id?: number;

  @IsOptional()
  @Type(() => Number)
  offboarding_request_id?: number;
}

export class ApprovePayrollRunDto {
  @IsEnum(PayrollApprovalStageEnum)
  stage: PayrollApprovalStageEnum;

  @IsString()
  calculation_hash: string;

  @IsOptional()
  @IsString()
  comments?: string;
}

export class CreatePayrollAccountingMappingDto {
  @IsString()
  component_code: string;

  @IsString()
  debit_account_code: string;

  @IsString()
  credit_account_code: string;

  @IsOptional()
  dimensions?: Record<string, unknown>;
}

export class CreatePayrollGroupDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @Type(() => Number)
  payroll_calendar_id?: number;

  @IsOptional()
  @Type(() => Number)
  branch_id?: number;

  @IsOptional()
  @Type(() => Number)
  department_id?: number;

  @IsOptional()
  @IsString()
  employee_category?: string;

  @IsOptional()
  @IsString()
  employment_type?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  policy?: Record<string, unknown>;
}

export class CreatePayrollGroupAssignmentDto {
  @Type(() => Number)
  @IsNumber()
  payroll_group_id: number;

  @Type(() => Number)
  @IsNumber()
  employee_id: number;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class CreatePayrollOvertimePolicyDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  component_code?: string;

  @IsOptional()
  @IsString()
  regular_multiplier?: string;

  @IsOptional()
  @IsString()
  weekend_multiplier?: string;

  @IsOptional()
  @IsString()
  holiday_multiplier?: string;

  @IsOptional()
  @Type(() => Number)
  minimum_minutes?: number;

  @IsOptional()
  @IsBoolean()
  approval_required?: boolean;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @IsOptional()
  configuration?: Record<string, unknown>;
}

export class CreatePayrollLeaveRuleDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  leave_type_code: string;

  @IsOptional()
  @IsString()
  paid_percentage?: string;

  @IsOptional()
  @IsString()
  paid_days_cap?: string;

  @IsOptional()
  @IsString()
  half_pay_after_days?: string;

  @IsOptional()
  @IsString()
  unpaid_after_days?: string;

  @IsOptional()
  @IsString()
  carry_forward_cap_days?: string;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @IsOptional()
  configuration?: Record<string, unknown>;
}

export class CreatePayrollBonusSchemeDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  scheme_type?: string;

  @IsString()
  component_code: string;

  @IsOptional()
  @IsString()
  calculation_method?: string;

  @IsOptional()
  @IsString()
  default_amount?: string;

  @IsOptional()
  @IsString()
  default_rate?: string;

  @IsOptional()
  @IsBoolean()
  approval_required?: boolean;

  @IsDateString()
  effective_from: string;

  @IsOptional()
  @IsDateString()
  effective_to?: string;

  @IsOptional()
  configuration?: Record<string, unknown>;
}

export class CreatePayrollAdjustmentDto {
  @Type(() => Number)
  @IsNumber()
  payroll_period_id: number;

  @Type(() => Number)
  @IsNumber()
  employee_id: number;

  @IsString()
  component_code: string;

  @IsString()
  amount: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  adjustment_type?: string;

  @IsOptional()
  @IsString()
  effective_period_code?: string;
}

export class CreatePayrollSourceRecordDto {
  @Type(() => Number)
  @IsNumber()
  payroll_period_id: number;

  @IsOptional()
  @Type(() => Number)
  employee_id?: number;

  @IsString()
  source_type: string;

  @IsOptional()
  @IsString()
  source_reference?: string;

  @IsOptional()
  @IsString()
  scheme_code?: string;

  @IsString()
  component_code: string;

  @IsOptional()
  @IsString()
  source_amount?: string;

  @IsOptional()
  @IsString()
  quantity?: string;

  @IsOptional()
  @IsString()
  rate?: string;

  @IsOptional()
  @IsString()
  calculated_amount?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  payload?: Record<string, unknown>;
}

export class CreatePayrollSourceRecordBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePayrollSourceRecordDto)
  records: CreatePayrollSourceRecordDto[];

  @IsOptional()
  @IsBoolean()
  auto_approve?: boolean;
}

export class GeneratePayrollSourceRecordsDto {
  @Type(() => Number)
  @IsNumber()
  payroll_period_id: number;

  @IsEnum(['KPI', 'PERFORMANCE'] as const)
  source_type: 'KPI' | 'PERFORMANCE';

  @IsOptional()
  @Type(() => Number)
  performance_period_id?: number;

  @IsOptional()
  @Type(() => Number)
  financial_year_id?: number;

  @IsOptional()
  @IsString()
  period_type?: string;

  @IsOptional()
  @Type(() => Number)
  sequence_number?: number;

  @IsOptional()
  @IsString()
  scheme_code?: string;

  @IsOptional()
  @IsString()
  component_code?: string;

  @IsOptional()
  @IsString()
  amount_per_score_point?: string;

  @IsOptional()
  @IsString()
  minimum_score?: string;

  @IsOptional()
  @IsBoolean()
  auto_approve?: boolean;

  @IsOptional()
  @IsBoolean()
  replace_existing?: boolean;
}

export class PayrollOvertimeApprovalQueryDto {
  @IsOptional()
  @Type(() => Number)
  employee_id?: number;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class DecidePayrollOvertimeDto {
  @IsOptional()
  @IsString()
  comments?: string;
}

export class PayrollReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  payroll_run_id?: number;

  @IsOptional()
  @Type(() => Number)
  payroll_period_id?: number;

  @IsOptional()
  @Type(() => Number)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  employee_id?: number;
}

export class ReconcilePayrollPaymentDto {
  @IsString()
  payment_reference: string;

  @IsDateString()
  payment_date: string;

  @IsString()
  paid_amount: string;

  @IsOptional()
  @Type(() => Number)
  bank_batch_id?: number;

  @IsOptional()
  snapshot?: Record<string, unknown>;
}
