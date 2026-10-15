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

@Entity('employee_finance_letter_templates')
@Unique('UQ_employee_finance_letter_template_type', [
  'companyId',
  'templateType',
])
export class EmployeeFinanceLetterTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'template_type', type: 'varchar', length: 40 })
  templateType: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'text' })
  letterhead: string;

  /** Letter body with {{placeholder}} tokens resolved at generation time. */
  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'signatory_name', type: 'varchar', length: 180 })
  signatoryName: string;

  @Column({ name: 'signatory_title', type: 'varchar', length: 180 })
  signatoryTitle: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'updated_by_company_user_id', type: 'int', nullable: true })
  updatedByCompanyUserId: number | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('employee_finance_approval_delegations')
@Index('IDX_employee_finance_delegation_delegate', [
  'companyId',
  'delegateCompanyUserId',
  'status',
])
export class EmployeeFinanceApprovalDelegation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'delegator_company_user_id' })
  delegatorCompanyUserId: number;

  @Column({ name: 'delegate_company_user_id' })
  delegateCompanyUserId: number;

  /** Approval stages the delegate may decide on the delegator's behalf. */
  @Column({ type: 'jsonb' })
  stages: string[];

  @Column({ name: 'starts_on', type: 'date' })
  startsOn: string;

  @Column({ name: 'ends_on', type: 'date' })
  endsOn: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('employee_finance_adjustments')
@Unique('UQ_employee_finance_adjustment_idempotency', [
  'companyId',
  'idempotencyKey',
])
@Index('IDX_employee_finance_adjustment_account', [
  'companyId',
  'accountId',
  'status',
])
export class EmployeeFinanceAdjustment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ name: 'installment_id', type: 'int', nullable: true })
  installmentId: number | null;

  @Column({ name: 'adjustment_type', type: 'varchar', length: 30 })
  adjustmentType: string;

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

  @Column({ type: 'text' })
  reason: string;

  /** MANUAL, or OVERDUE_RULE when raised by the nightly overdue job. */
  @Column({ type: 'varchar', length: 30, default: 'MANUAL' })
  source: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
  idempotencyKey: string;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'decided_by_company_user_id', type: 'int', nullable: true })
  decidedByCompanyUserId: number | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'decision_comments', type: 'text', nullable: true })
  decisionComments: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
