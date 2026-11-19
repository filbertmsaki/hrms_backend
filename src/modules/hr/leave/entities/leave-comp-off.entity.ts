import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type CompOffPolicyStatus = 'draft' | 'approved' | 'retired';
export type CompOffSourceType = 'OVERTIME_REQUEST' | 'AUTHORIZED_WORK';
export type CompOffCreditStatus =
  | 'pending_approval'
  | 'credited'
  | 'expired'
  | 'reversed'
  | 'rejected';

/**
 * HR-approved comp-off rules for one leave type. Earning is impossible while
 * no row exists or the row is not 'approved'.
 */
@Entity('leave_comp_off_policies')
@Unique('UQ_leave_comp_off_policy_type', ['company_id', 'leave_type_id'])
export class LeaveCompOffPolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'int' })
  leave_type_id: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: CompOffPolicyStatus;

  /** Approved hours of qualifying work that equal one leave day. */
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  hours_per_day: string | null;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  minimum_hours: string | null;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  max_days_per_credit: string | null;

  @Column({ type: 'int', nullable: true })
  expiry_days: number | null;

  @Column({ type: 'boolean', default: true })
  requires_approval: boolean;

  @Column({ type: 'jsonb', nullable: true })
  eligible_employment_types: string[] | null;

  @Column({ type: 'jsonb', default: () => `'["OVERTIME_REQUEST"]'` })
  allowed_sources: CompOffSourceType[];

  @Column({ type: 'int', nullable: true })
  approved_by_company_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/** One earned comp-off credit, linked to exactly one source. */
@Entity('leave_comp_off_credits')
@Unique('UQ_leave_comp_off_credit_source', [
  'company_id',
  'source_type',
  'source_reference',
])
@Index('IDX_leave_comp_off_credit_employee', [
  'company_id',
  'employee_id',
  'leave_type_id',
  'status',
])
export class LeaveCompOffCredit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'int' })
  employee_id: number;

  @Column({ type: 'int' })
  leave_type_id: number;

  @Column({ type: 'int' })
  policy_id: number;

  @Column({ type: 'varchar', length: 40 })
  source_type: CompOffSourceType;

  @Column({ type: 'varchar', length: 120 })
  source_reference: string;

  @Column({ type: 'date' })
  work_date: string;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  hours: string;

  @Column({ type: 'decimal', precision: 6, scale: 2 })
  days: string;

  @Column({ type: 'varchar', length: 20 })
  leave_year: string;

  @Column({ type: 'date', nullable: true })
  expires_on: string | null;

  @Column({ type: 'varchar', length: 20 })
  status: CompOffCreditStatus;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  expired_days: string;

  @Column({ type: 'int', nullable: true })
  credit_transaction_id: number | null;

  @Column({ type: 'int', nullable: true })
  closing_transaction_id: number | null;

  @Column({ type: 'int', nullable: true })
  requested_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  approved_by_company_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'text', nullable: true })
  closed_reason: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
