import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type RecalculationScope =
  | 'employee'
  | 'department'
  | 'branch'
  | 'company';
export type RecalculationTrigger =
  | 'manual'
  | 'initial'
  | 'probation'
  | 'policy_change'
  | 'hire_date';
/**
 * queued → previewing → preview_ready → (apply) pending_approval →
 * approved → applying → completed | partially_failed | failed.
 * cancelled / superseded end a run without changes.
 */
export type RecalculationStatus =
  | 'queued'
  | 'previewing'
  | 'preview_ready'
  | 'pending_approval'
  | 'approved'
  | 'applying'
  | 'completed'
  | 'partially_failed'
  | 'failed'
  | 'cancelled'
  | 'superseded';

export const ACTIVE_RECALCULATION_STATUSES: RecalculationStatus[] = [
  'queued',
  'previewing',
  'preview_ready',
  'pending_approval',
  'approved',
  'applying',
];

/**
 * A leave balance recalculation: always previewed first (dry run, no
 * changes); corrections are posted only after an authorised apply (and an
 * independent approval for bulk scopes), as RECALCULATION ledger entries
 * referencing this run.
 */
@Entity('leave_recalculation_runs')
@Index('IDX_leave_recalc_run_company', ['company_id', 'created_at'])
@Index('UQ_leave_recalc_run_active_scope', ['company_id', 'scope_key'], {
  unique: true,
  where: `"status" IN ('queued', 'previewing', 'preview_ready', 'pending_approval', 'approved', 'applying')`,
})
export class LeaveRecalculationRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'varchar', length: 40 })
  reference: string;

  @Column({ type: 'varchar', length: 20 })
  scope_type: RecalculationScope;

  /** employee / department / branch id; null for company. */
  @Column({ type: 'int', nullable: true })
  scope_id: number | null;

  @Column({ type: 'int', nullable: true })
  leave_type_id: number | null;

  /** company:all | employee:12 | department:3 (+ :type:7) — one active run each. */
  @Column({ type: 'varchar', length: 80 })
  scope_key: string;

  /** Cutoff: balances are recalculated as at this company date. */
  @Column({ type: 'date' })
  as_of_date: string;

  @Column({ type: 'varchar', length: 20 })
  trigger: RecalculationTrigger;

  @Column({ type: 'varchar', length: 30, default: 'queued' })
  status: RecalculationStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'int', nullable: true })
  initiated_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  submitted_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'int', nullable: true })
  approved_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'int', default: 0 })
  employees_total: number;

  @Column({ type: 'int', default: 0 })
  employees_done: number;

  @Column({ type: 'int', default: 0 })
  lines_changed: number;

  @Column({ type: 'int', default: 0 })
  lines_applied: number;

  @Column({ type: 'int', default: 0 })
  lines_failed: number;

  @Column({ type: 'int', default: 0 })
  lines_skipped: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => LeaveRecalculationLine, (line) => line.run)
  lines: LeaveRecalculationLine[];
}

export type RecalculationLineStatus =
  | 'unchanged'
  | 'changed'
  | 'applied'
  | 'stale'
  | 'failed'
  | 'skipped';

/** One employee × leave type in a run: current vs recalculated, and why. */
@Entity('leave_recalculation_lines')
@Index('IDX_leave_recalc_line_run', ['run_id', 'status'])
@Index('IDX_leave_recalc_line_employee', ['company_id', 'employee_id'])
export class LeaveRecalculationLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  run_id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column()
  leave_type_id: number;

  @Column({ type: 'int', nullable: true })
  leave_balance_id: number | null;

  @Column({ type: 'varchar', length: 20 })
  fiscal_year: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  entitlement_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  current_accrued_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  recalculated_accrued_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  current_available_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  recalculated_available_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  difference_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  used_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  pending_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  adjusted_days: string;

  @Column({ type: 'int', nullable: true })
  policy_id: number | null;

  @Column({ type: 'int', nullable: true })
  policy_version: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  accrual_frequency: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  accrual_start_basis: string | null;

  @Column({ type: 'date', nullable: true })
  accrual_start_date: string | null;

  @Column({ type: 'date', nullable: true })
  hire_date: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  probation_status: string | null;

  @Column({ type: 'date', nullable: true })
  probation_completion_date: string | null;

  @Column({ type: 'int', default: 0 })
  periods_evaluated: number;

  @Column({ type: 'jsonb', nullable: true })
  warnings: string[] | null;

  @Column({ type: 'varchar', length: 20 })
  status: RecalculationLineStatus;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => LeaveRecalculationRun, (run) => run.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'run_id' })
  run: LeaveRecalculationRun;
}
