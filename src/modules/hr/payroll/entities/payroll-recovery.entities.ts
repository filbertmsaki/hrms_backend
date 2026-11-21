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

export enum PayrollRecoveryMethodEnum {
  /** Employee pays the overpayment back; recorded with evidence. */
  REFUND = 'REFUND',
  /** Whole balance deducted from the next regular payroll (capacity permitting). */
  NEXT_PAYROLL = 'NEXT_PAYROLL',
  /** Fixed instalment deducted per regular payroll until settled. */
  INSTALLMENTS = 'INSTALLMENTS',
  /** Not recovered from the employee; settled by an accounting adjustment. */
  ACCOUNTING_ADJUSTMENT = 'ACCOUNTING_ADJUSTMENT',
}

export enum PayrollRecoveryLegalBasisEnum {
  EMPLOYEE_CONSENT = 'EMPLOYEE_CONSENT',
  WRITTEN_AGREEMENT = 'WRITTEN_AGREEMENT',
  COURT_ORDER = 'COURT_ORDER',
  STATUTORY = 'STATUTORY',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum PayrollRecoveryStatusEnum {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  SETTLED = 'SETTLED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum PayrollRecoveryEntryTypeEnum {
  PAYROLL_DEDUCTION = 'PAYROLL_DEDUCTION',
  REFUND = 'REFUND',
  ACCOUNTING_ADJUSTMENT = 'ACCOUNTING_ADJUSTMENT',
}

/**
 * An overpayment from a paid payroll run and how it is being recovered. The
 * original payroll is never modified; recovery happens through deductions in
 * later runs, a verified refund, or an accounting adjustment.
 */
@Entity('payroll_overpayment_recoveries')
@Index('IDX_payroll_recovery_company_employee_status', [
  'companyId',
  'employeeId',
  'status',
])
export class PayrollOverpaymentRecovery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'original_payroll_run_id' })
  originalPayrollRunId: number;

  @Column({ name: 'correction_payroll_run_id', type: 'int', nullable: true })
  correctionPayrollRunId: number | null;

  @Column({
    name: 'overpaid_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  overpaidAmount: string;

  @Column({
    name: 'recovered_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: '0',
  })
  recoveredAmount: string;

  @Column({ type: 'varchar', length: 30 })
  method: PayrollRecoveryMethodEnum;

  @Column({
    name: 'installment_amount',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  installmentAmount: string | null;

  @Column({ name: 'legal_basis', type: 'varchar', length: 30 })
  legalBasis: PayrollRecoveryLegalBasisEnum;

  /** Consent form, agreement or order reference backing a deduction. */
  @Column({ name: 'consent_reference', type: 'text', nullable: true })
  consentReference: string | null;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: PayrollRecoveryStatusEnum.PENDING_APPROVAL,
  })
  status: PayrollRecoveryStatusEnum;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote: string | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/**
 * Settled recovery amounts. Each entry is written exactly once (unique
 * idempotency key), so payment-confirmation retries never double-count.
 */
@Entity('payroll_overpayment_recovery_entries')
@Unique('UQ_payroll_recovery_entry_idempotency', [
  'companyId',
  'idempotencyKey',
])
@Index('IDX_payroll_recovery_entry_recovery', ['recoveryId'])
export class PayrollOverpaymentRecoveryEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'recovery_id' })
  recoveryId: number;

  @Column({ name: 'entry_type', type: 'varchar', length: 30 })
  entryType: PayrollRecoveryEntryTypeEnum;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: string;

  @Column({ name: 'payroll_run_id', type: 'int', nullable: true })
  payrollRunId: number | null;

  @Column({ name: 'employee_payroll_result_id', type: 'int', nullable: true })
  employeePayrollResultId: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference: string | null;

  @Column({ type: 'text', nullable: true })
  evidence: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 160 })
  idempotencyKey: string;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
