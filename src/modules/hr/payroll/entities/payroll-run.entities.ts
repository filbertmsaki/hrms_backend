import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import {
  EmployeePayrollResultStatusEnum,
  PayrollApprovalDecisionEnum,
  PayrollApprovalStageEnum,
  PayrollInputStatusEnum,
  PayrollOutputStatusEnum,
  PayrollRunStatusEnum,
  PayrollRunTypeEnum,
} from '../payroll.enums';

@Entity('payroll_runs')
@Unique('UQ_payroll_run_company_no', ['companyId', 'runNo'])
@Index('IDX_payroll_run_period_status', ['payrollPeriodId', 'status'])
export class PayrollRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'payroll_period_id' })
  payrollPeriodId: number;

  @Column({ name: 'run_no', type: 'varchar', length: 60 })
  runNo: string;

  @Column({ name: 'run_type', type: 'enum', enum: PayrollRunTypeEnum })
  runType: PayrollRunTypeEnum;

  @Column({
    type: 'enum',
    enum: PayrollRunStatusEnum,
    default: PayrollRunStatusEnum.DRAFT,
  })
  status: PayrollRunStatusEnum;

  @Column({ name: 'parent_run_id', nullable: true })
  parentRunId: number | null;

  @Column({ name: 'offboarding_request_id', nullable: true })
  offboardingRequestId: number | null;

  @Column({ name: 'calculation_version', type: 'int', default: 1 })
  calculationVersion: number;

  @Column({ name: 'employee_count', type: 'int', default: 0 })
  employeeCount: number;

  @Column({ name: 'gross_total', type: 'decimal', precision: 20, scale: 2, default: '0' })
  grossTotal: string;

  @Column({ name: 'taxable_total', type: 'decimal', precision: 20, scale: 2, default: '0' })
  taxableTotal: string;

  @Column({ name: 'deduction_total', type: 'decimal', precision: 20, scale: 2, default: '0' })
  deductionTotal: string;

  @Column({ name: 'employer_contribution_total', type: 'decimal', precision: 20, scale: 2, default: '0' })
  employerContributionTotal: string;

  @Column({ name: 'net_pay_total', type: 'decimal', precision: 20, scale: 2, default: '0' })
  netPayTotal: string;

  @Column({ name: 'total_employer_cost', type: 'decimal', precision: 20, scale: 2, default: '0' })
  totalEmployerCost: string;

  @Column({ name: 'input_snapshot', type: 'jsonb', nullable: true })
  inputSnapshot: Record<string, unknown> | null;

  @Column({ name: 'configuration_snapshot', type: 'jsonb', nullable: true })
  configurationSnapshot: Record<string, unknown> | null;

  @Column({ name: 'calculation_hash', type: 'varchar', length: 128, nullable: true })
  calculationHash: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'calculated_at', type: 'timestamptz', nullable: true })
  calculatedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'created_by_company_user_id' })
  createdByCompanyUserId: number;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('payroll_run_approvals')
@Unique('UQ_payroll_run_approval_stage', ['payrollRunId', 'stage'])
export class PayrollRunApproval {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'payroll_run_id' })
  payrollRunId: number;

  @Column({ type: 'enum', enum: PayrollApprovalStageEnum })
  stage: PayrollApprovalStageEnum;

  @Column({ type: 'enum', enum: PayrollApprovalDecisionEnum })
  decision: PayrollApprovalDecisionEnum;

  @Column({ name: 'calculation_hash', type: 'varchar', length: 128 })
  calculationHash: string;

  @Column({ name: 'approved_by_company_user_id' })
  approvedByCompanyUserId: number;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('payroll_inputs')
@Index('IDX_payroll_input_period_employee', [
  'companyId',
  'payrollPeriodId',
  'employeeId',
])
export class PayrollInput {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'payroll_period_id' })
  payrollPeriodId: number;

  @Column({ name: 'employee_id', nullable: true })
  employeeId: number | null;

  @Column({ name: 'component_code', type: 'varchar', length: 80 })
  componentCode: string;

  @Column({ name: 'source_module', type: 'varchar', length: 80 })
  sourceModule: string;

  @Column({ name: 'source_reference', type: 'varchar', length: 150, nullable: true })
  sourceReference: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: '0' })
  amount: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  quantity: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  rate: string | null;

  @Column({ type: 'varchar', length: 3, default: 'TZS' })
  currency: string;

  @Column({ type: 'enum', enum: PayrollInputStatusEnum, default: PayrollInputStatusEnum.DRAFT })
  status: PayrollInputStatusEnum;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ name: 'approved_by_company_user_id', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('employee_payroll_results')
@Unique('UQ_employee_payroll_result', ['payrollRunId', 'employeeId'])
export class EmployeePayrollResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'payroll_run_id' })
  payrollRunId: number;

  @Column({ name: 'payroll_period_id' })
  payrollPeriodId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({
    type: 'enum',
    enum: EmployeePayrollResultStatusEnum,
    default: EmployeePayrollResultStatusEnum.PENDING,
  })
  status: EmployeePayrollResultStatusEnum;

  @Column({ name: 'employee_snapshot', type: 'jsonb' })
  employeeSnapshot: Record<string, unknown>;

  @Column({ name: 'compensation_snapshot', type: 'jsonb' })
  compensationSnapshot: Record<string, unknown>;

  @Column({ name: 'bank_account_snapshot', type: 'jsonb', nullable: true })
  bankAccountSnapshot: Record<string, unknown> | null;

  @Column({ name: 'statutory_snapshot', type: 'jsonb', nullable: true })
  statutorySnapshot: Record<string, unknown> | null;

  @Column({ name: 'input_snapshot', type: 'jsonb', nullable: true })
  inputSnapshot: Record<string, unknown> | null;

  @Column({ name: 'calculation_snapshot', type: 'jsonb' })
  calculationSnapshot: Record<string, unknown>;

  @Column({ name: 'gross_pay', type: 'decimal', precision: 20, scale: 2, default: '0' })
  grossPay: string;

  @Column({ name: 'taxable_pay', type: 'decimal', precision: 20, scale: 2, default: '0' })
  taxablePay: string;

  @Column({ name: 'employee_deductions', type: 'decimal', precision: 20, scale: 2, default: '0' })
  employeeDeductions: string;

  @Column({ name: 'employer_contributions', type: 'decimal', precision: 20, scale: 2, default: '0' })
  employerContributions: string;

  @Column({ name: 'net_pay', type: 'decimal', precision: 20, scale: 2, default: '0' })
  netPay: string;

  @Column({ name: 'employer_cost', type: 'decimal', precision: 20, scale: 2, default: '0' })
  employerCost: string;

  @Column({ name: 'calculation_hash', type: 'varchar', length: 128 })
  calculationHash: string;

  @Column({ type: 'jsonb', nullable: true })
  warnings: Record<string, unknown>[] | null;

  @Column({ type: 'jsonb', nullable: true })
  errors: Record<string, unknown>[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('employee_payroll_line_items')
@Index('IDX_employee_payroll_line_result', ['employeePayrollResultId'])
export class EmployeePayrollLineItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'payroll_run_id' })
  payrollRunId: number;

  @Column({ name: 'employee_payroll_result_id' })
  employeePayrollResultId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'component_code', type: 'varchar', length: 80 })
  componentCode: string;

  @Column({ name: 'component_name', type: 'varchar', length: 180 })
  componentName: string;

  @Column({ name: 'component_type', type: 'varchar', length: 60 })
  componentType: string;

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  amount: string;

  @Column({ name: 'taxable_amount', type: 'decimal', precision: 20, scale: 2, default: '0' })
  taxableAmount: string;

  @Column({ name: 'employer_amount', type: 'decimal', precision: 20, scale: 2, default: '0' })
  employerAmount: string;

  @Column({ name: 'calculation_order', type: 'int', default: 100 })
  calculationOrder: number;

  @Column({ name: 'source_type', type: 'varchar', length: 80 })
  sourceType: string;

  @Column({ name: 'source_reference', type: 'varchar', length: 150, nullable: true })
  sourceReference: string | null;

  @Column({ name: 'calculation_snapshot', type: 'jsonb', nullable: true })
  calculationSnapshot: Record<string, unknown> | null;
}

@Entity('payroll_result_adjustments')
export class PayrollResultAdjustment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_payroll_result_id' })
  employeePayrollResultId: number;

  @Column({ name: 'component_code', type: 'varchar', length: 80 })
  componentCode: string;

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  amount: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'created_by_company_user_id' })
  createdByCompanyUserId: number;

  @Column({ name: 'approved_by_company_user_id', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('payroll_deduction_shortfalls')
export class PayrollDeductionShortfall {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_payroll_result_id' })
  employeePayrollResultId: number;

  @Column({ name: 'component_code', type: 'varchar', length: 80 })
  componentCode: string;

  @Column({ name: 'requested_amount', type: 'decimal', precision: 20, scale: 2 })
  requestedAmount: string;

  @Column({ name: 'applied_amount', type: 'decimal', precision: 20, scale: 2 })
  appliedAmount: string;

  @Column({ name: 'deferred_amount', type: 'decimal', precision: 20, scale: 2 })
  deferredAmount: string;

  @Column({ type: 'varchar', length: 30, default: 'OPEN' })
  status: string;
}

@Entity('payslips')
@Unique('UQ_payslip_result', ['employeePayrollResultId'])
export class Payslip {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'payroll_run_id' })
  payrollRunId: number;

  @Column({ name: 'employee_payroll_result_id' })
  employeePayrollResultId: number;

  @Column({ name: 'payslip_no', type: 'varchar', length: 80 })
  payslipNo: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ name: 'result_hash', type: 'varchar', length: 128 })
  resultHash: string;

  @Column({ name: 'document_id', nullable: true })
  documentId: number | null;

  @Column({ type: 'enum', enum: PayrollOutputStatusEnum, default: PayrollOutputStatusEnum.GENERATED })
  status: PayrollOutputStatusEnum;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('payroll_bank_batches')
@Unique('UQ_payroll_bank_batch_run', ['companyId', 'payrollRunId'])
export class PayrollBankBatch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'payroll_run_id' })
  payrollRunId: number;

  @Column({ name: 'batch_no', type: 'varchar', length: 80 })
  batchNo: string;

  @Column({ name: 'bank_format_code', type: 'varchar', length: 80, default: 'GENERIC_CSV' })
  bankFormatCode: string;

  @Column({ name: 'record_count', type: 'int', default: 0 })
  recordCount: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 20, scale: 2, default: '0' })
  totalAmount: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ name: 'file_content', type: 'text' })
  fileContent: string;

  @Column({ name: 'file_hash', type: 'varchar', length: 128 })
  fileHash: string;

  @Column({ type: 'enum', enum: PayrollOutputStatusEnum, default: PayrollOutputStatusEnum.GENERATED })
  status: PayrollOutputStatusEnum;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('payroll_journal_batches')
@Unique('UQ_payroll_journal_batch_run', ['companyId', 'payrollRunId'])
export class PayrollJournalBatch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'payroll_run_id' })
  payrollRunId: number;

  @Column({ name: 'batch_no', type: 'varchar', length: 80 })
  batchNo: string;

  @Column({ name: 'debit_total', type: 'decimal', precision: 20, scale: 2, default: '0' })
  debitTotal: string;

  @Column({ name: 'credit_total', type: 'decimal', precision: 20, scale: 2, default: '0' })
  creditTotal: string;

  @Column({ type: 'jsonb' })
  entries: Record<string, unknown>[];

  @Column({ name: 'external_reference', type: 'varchar', length: 150, nullable: true })
  externalReference: string | null;

  @Column({ type: 'enum', enum: PayrollOutputStatusEnum, default: PayrollOutputStatusEnum.GENERATED })
  status: PayrollOutputStatusEnum;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('payroll_variance_results')
export class PayrollVarianceResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'payroll_run_id' })
  payrollRunId: number;

  @Column({ name: 'comparison_run_id', nullable: true })
  comparisonRunId: number | null;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ name: 'variance_total', type: 'decimal', precision: 20, scale: 2, default: '0' })
  varianceTotal: string;

  @Column({ name: 'unexplained_count', type: 'int', default: 0 })
  unexplainedCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('payroll_final_settlements')
@Unique('UQ_payroll_final_settlement_offboarding', ['offboardingRequestId'])
export class PayrollFinalSettlement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'offboarding_request_id' })
  offboardingRequestId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'payroll_run_id', nullable: true })
  payrollRunId: number | null;

  @Column({ name: 'gross_settlement', type: 'decimal', precision: 20, scale: 2, default: '0' })
  grossSettlement: string;

  @Column({ name: 'deduction_total', type: 'decimal', precision: 20, scale: 2, default: '0' })
  deductionTotal: string;

  @Column({ name: 'net_settlement', type: 'decimal', precision: 20, scale: 2, default: '0' })
  netSettlement: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('payroll_audit_logs')
@Index('IDX_payroll_audit_company_entity', ['companyId', 'entityType', 'entityId'])
export class PayrollAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'actor_company_user_id', nullable: true })
  actorCompanyUserId: number | null;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 80 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'varchar', length: 80 })
  entityId: string;

  @Column({ type: 'jsonb', nullable: true })
  summary: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
