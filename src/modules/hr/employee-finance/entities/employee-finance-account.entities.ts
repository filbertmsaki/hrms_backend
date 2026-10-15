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
  EmployeeFinanceAccountStatusEnum,
  EmployeeFinanceDisbursementStatusEnum,
  EmployeeFinanceInstallmentStatusEnum,
  EmployeeFinanceLedgerEntryTypeEnum,
  EmployeeFinancePayrollInstructionStatusEnum,
  EmployeeFinanceProductTypeEnum,
  EmployeeFinanceRepaymentStatusEnum,
} from '../employee-finance.enums';

@Entity('employee_finance_accounts')
@Unique('UQ_employee_finance_account_company_no', ['companyId', 'accountNo'])
@Index('IDX_employee_finance_account_employee_status', [
  'companyId',
  'employeeId',
  'status',
])
export class EmployeeFinanceAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'application_id' })
  applicationId: number;

  @Column({ name: 'product_id' })
  productId: number;

  @Column({ name: 'account_no', type: 'varchar', length: 60 })
  accountNo: string;

  @Column({
    name: 'product_type',
    type: 'enum',
    enum: EmployeeFinanceProductTypeEnum,
    enumName: 'employee_finance_product_type_enum',
  })
  productType: EmployeeFinanceProductTypeEnum;

  @Column({
    type: 'enum',
    enum: EmployeeFinanceAccountStatusEnum,
    enumName: 'employee_finance_account_status_enum',
    default: EmployeeFinanceAccountStatusEnum.PENDING_DISBURSEMENT,
  })
  status: EmployeeFinanceAccountStatusEnum;

  @Column({
    name: 'principal_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  principalAmount: string;

  @Column({
    name: 'interest_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  interestAmount: string;

  @Column({
    name: 'fee_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  feeAmount: string;

  @Column({ name: 'total_payable', type: 'decimal', precision: 18, scale: 2 })
  totalPayable: string;

  @Column({
    name: 'outstanding_principal',
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  outstandingPrincipal: string;

  @Column({
    name: 'outstanding_interest',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  outstandingInterest: string;

  @Column({
    name: 'outstanding_fees',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  outstandingFees: string;

  @Column({
    name: 'outstanding_total',
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  outstandingTotal: string;

  @Column({
    name: 'scheduled_monthly_installment',
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  scheduledMonthlyInstallment: string;

  @Column({ name: 'term_months', type: 'int' })
  termMonths: number;

  @Column({
    name: 'interest_rate',
    type: 'decimal',
    precision: 9,
    scale: 6,
    default: '0',
  })
  interestRate: string;

  @Column({ name: 'schedule_version', type: 'int', default: 1 })
  scheduleVersion: number;

  @Column({ name: 'disbursed_at', type: 'timestamptz', nullable: true })
  disbursedAt: Date | null;

  @Column({ name: 'first_repayment_date', type: 'date' })
  firstRepaymentDate: string;

  @Column({ name: 'maturity_date', type: 'date' })
  maturityDate: string;

  @Column({ name: 'product_snapshot', type: 'jsonb' })
  productSnapshot: Record<string, unknown>;

  @Column({ name: 'agreement_snapshot', type: 'jsonb' })
  agreementSnapshot: Record<string, unknown>;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('employee_finance_disbursements')
@Unique('UQ_employee_finance_disbursement_reference', [
  'companyId',
  'paymentReference',
])
export class EmployeeFinanceDisbursement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ name: 'amount', type: 'decimal', precision: 18, scale: 2 })
  amount: string;

  @Column({ name: 'payment_reference', type: 'varchar', length: 150 })
  paymentReference: string;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column({
    type: 'enum',
    enum: EmployeeFinanceDisbursementStatusEnum,
    enumName: 'employee_finance_disbursement_status_enum',
    default: EmployeeFinanceDisbursementStatusEnum.PENDING_APPROVAL,
  })
  status: EmployeeFinanceDisbursementStatusEnum;

  @Column({ name: 'created_by_company_user_id' })
  createdByCompanyUserId: number;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('employee_finance_installments')
@Unique('UQ_employee_finance_installment_sequence', [
  'accountId',
  'scheduleVersion',
  'installmentNumber',
])
@Index('IDX_employee_finance_installment_due_status', [
  'companyId',
  'dueDate',
  'status',
])
export class EmployeeFinanceInstallment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'payroll_period_id', type: 'int', nullable: true })
  payrollPeriodId: number | null;

  @Column({ name: 'schedule_version', type: 'int', default: 1 })
  scheduleVersion: number;

  @Column({ name: 'installment_number', type: 'int' })
  installmentNumber: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ name: 'principal_due', type: 'decimal', precision: 18, scale: 2 })
  principalDue: string;

  @Column({
    name: 'interest_due',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  interestDue: string;

  @Column({
    name: 'fee_due',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  feeDue: string;

  @Column({ name: 'total_due', type: 'decimal', precision: 18, scale: 2 })
  totalDue: string;

  @Column({
    name: 'paid_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  paidAmount: string;

  @Column({
    type: 'enum',
    enum: EmployeeFinanceInstallmentStatusEnum,
    enumName: 'employee_finance_installment_status_enum',
    default: EmployeeFinanceInstallmentStatusEnum.SCHEDULED,
  })
  status: EmployeeFinanceInstallmentStatusEnum;

  /** Due date before any approved deferment moved it. */
  @Column({ name: 'original_due_date', type: 'date', nullable: true })
  originalDueDate: string | null;

  @Column({ name: 'overdue_since', type: 'date', nullable: true })
  overdueSince: string | null;
}

@Entity('employee_finance_ledger_entries')
@Unique('UQ_employee_finance_ledger_idempotency', [
  'companyId',
  'idempotencyKey',
])
@Index('IDX_employee_finance_ledger_account', ['companyId', 'accountId'])
export class EmployeeFinanceLedgerEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ name: 'installment_id', type: 'int', nullable: true })
  installmentId: number | null;

  @Column({
    name: 'entry_type',
    type: 'enum',
    enum: EmployeeFinanceLedgerEntryTypeEnum,
    enumName: 'employee_finance_ledger_entry_type_enum',
  })
  entryType: EmployeeFinanceLedgerEntryTypeEnum;

  @Column({ type: 'varchar', length: 20 })
  direction: 'DEBIT' | 'CREDIT';

  @Column({
    name: 'principal_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  principalAmount: string;

  @Column({
    name: 'interest_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  interestAmount: string;

  @Column({
    name: 'fee_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  feeAmount: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 18, scale: 2 })
  totalAmount: string;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @Column({ name: 'posted_at', type: 'timestamptz' })
  postedAt: Date;

  @Column({ name: 'source_type', type: 'varchar', length: 80 })
  sourceType: string;

  @Column({ name: 'source_id', type: 'varchar', length: 150, nullable: true })
  sourceId: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
  idempotencyKey: string;

  @Column({ name: 'reverses_entry_id', type: 'int', nullable: true })
  reversesEntryId: number | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'balance_snapshot', type: 'jsonb' })
  balanceSnapshot: Record<string, unknown>;

  @Column({ name: 'posted_by_company_user_id', type: 'int', nullable: true })
  postedByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('employee_finance_repayments')
export class EmployeeFinanceRepayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ type: 'varchar', length: 40 })
  repaymentType: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: string;

  @Column({
    name: 'payment_reference',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  paymentReference: string | null;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column({
    type: 'enum',
    enum: EmployeeFinanceRepaymentStatusEnum,
    enumName: 'employee_finance_repayment_status_enum',
    default: EmployeeFinanceRepaymentStatusEnum.DRAFT,
  })
  status: EmployeeFinanceRepaymentStatusEnum;

  @Column({ name: 'created_by_company_user_id' })
  createdByCompanyUserId: number;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;
}

@Entity('employee_finance_repayment_allocations')
export class EmployeeFinanceRepaymentAllocation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'repayment_id' })
  repaymentId: number;

  @Column({ name: 'installment_id', type: 'int', nullable: true })
  installmentId: number | null;

  @Column({
    name: 'principal_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  principalAmount: string;

  @Column({
    name: 'interest_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  interestAmount: string;

  @Column({
    name: 'fee_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  feeAmount: string;
}

@Entity('employee_finance_payroll_instructions')
@Unique('UQ_employee_finance_instruction_installment_period', [
  'installmentId',
  'payrollPeriodId',
])
export class EmployeeFinancePayrollInstruction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ name: 'installment_id' })
  installmentId: number;

  @Column({ name: 'payroll_period_id' })
  payrollPeriodId: number;

  @Column({ name: 'payroll_run_id', type: 'int', nullable: true })
  payrollRunId: number | null;

  @Column({ name: 'component_code', type: 'varchar', length: 80 })
  componentCode: string;

  @Column({ name: 'amount', type: 'decimal', precision: 18, scale: 2 })
  amount: string;

  @Column({
    name: 'reserved_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  reservedAmount: string;

  @Column({
    name: 'posted_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  postedAmount: string;

  @Column({
    type: 'enum',
    enum: EmployeeFinancePayrollInstructionStatusEnum,
    enumName: 'employee_finance_payroll_instruction_status_enum',
    default: EmployeeFinancePayrollInstructionStatusEnum.OPEN,
  })
  status: EmployeeFinancePayrollInstructionStatusEnum;

  @Column({ type: 'jsonb', nullable: true })
  snapshot: Record<string, unknown> | null;

  /** How Finance chose to recover a payroll deduction shortfall. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  resolution: string | null;

  @Column({ name: 'resolved_by_company_user_id', type: 'int', nullable: true })
  resolvedByCompanyUserId: number | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({
    name: 'resolution_reference',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  resolutionReference: string | null;
}

@Entity('employee_finance_deferment_requests')
export class EmployeeFinanceDefermentRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ name: 'installment_id' })
  installmentId: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  status: string;

  @Column({
    name: 'requested_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  requestedByCompanyUserId: number | null;

  @Column({ name: 'decided_by_company_user_id', type: 'int', nullable: true })
  decidedByCompanyUserId: number | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'decision_comments', type: 'text', nullable: true })
  decisionComments: string | null;

  @Column({ name: 'original_due_date', type: 'date', nullable: true })
  originalDueDate: string | null;

  @Column({ name: 'new_due_date', type: 'date', nullable: true })
  newDueDate: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('employee_finance_reschedules')
export class EmployeeFinanceReschedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ name: 'old_schedule_version', type: 'int' })
  oldScheduleVersion: number;

  @Column({ name: 'new_schedule_version', type: 'int' })
  newScheduleVersion: number;

  @Column({ name: 'new_term_months', type: 'int' })
  newTermMonths: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  status: string;

  @Column({ name: 'old_term_months', type: 'int', nullable: true })
  oldTermMonths: number | null;

  /** Proposed replacement schedule shown to the approver before applying. */
  @Column({ name: 'schedule_preview', type: 'jsonb', nullable: true })
  schedulePreview: Record<string, unknown> | null;

  @Column({
    name: 'requested_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  requestedByCompanyUserId: number | null;

  @Column({ name: 'decided_by_company_user_id', type: 'int', nullable: true })
  decidedByCompanyUserId: number | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'decision_comments', type: 'text', nullable: true })
  decisionComments: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('employee_finance_settlement_quotes')
export class EmployeeFinanceSettlementQuote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ name: 'quote_no', type: 'varchar', length: 80 })
  quoteNo: string;

  @Column({
    name: 'settlement_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  settlementAmount: string;

  @Column({ name: 'valid_until', type: 'date' })
  validUntil: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ name: 'snapshot_hash', type: 'varchar', length: 128 })
  snapshotHash: string;

  @Column({ type: 'varchar', length: 30, default: 'OPEN' })
  status: string;

  @Column({ name: 'repayment_id', type: 'int', nullable: true })
  repaymentId: number | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt: Date | null;
}

@Entity('employee_finance_exit_recoveries')
@Unique('UQ_employee_finance_exit_recovery_account', [
  'offboardingRequestId',
  'accountId',
])
export class EmployeeFinanceExitRecovery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'offboarding_request_id' })
  offboardingRequestId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ name: 'recovery_amount', type: 'decimal', precision: 18, scale: 2 })
  recoveryAmount: string;

  @Column({
    name: 'recovered_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  recoveredAmount: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ name: 'snapshot_hash', type: 'varchar', length: 128 })
  snapshotHash: string;

  @Column({ type: 'varchar', length: 30, default: 'OPEN' })
  status: string;

  @Column({ name: 'settlement_item_id', type: 'int', nullable: true })
  settlementItemId: number | null;

  @Column({ name: 'recovered_at', type: 'timestamptz', nullable: true })
  recoveredAt: Date | null;
}

@Entity('employee_finance_audit_logs')
@Index('IDX_employee_finance_audit_company_entity', [
  'companyId',
  'entityType',
  'entityId',
])
export class EmployeeFinanceAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'actor_company_user_id', type: 'int', nullable: true })
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
