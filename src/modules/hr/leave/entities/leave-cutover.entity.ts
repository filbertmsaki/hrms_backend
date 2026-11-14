import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type LeaveCutoverStatus =
  | 'draft'
  | 'approved'
  | 'posted'
  | 'void'
  | 'reversed';

/**
 * Reconciliation snapshot for a Mainland cutover. Rows are frozen once the
 * snapshot leaves draft (database trigger) and `rows_sha256` seals them.
 */
@Entity('leave_cutover_snapshots')
@Index('IDX_leave_cutover_company', ['company_id', 'cutover_date'])
export class LeaveCutoverSnapshot {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) company_id: number;
  @Column({ type: 'int' }) policy_id: number;
  @Column({ type: 'int' }) policy_revision_id: number;
  @Column({ type: 'date' }) cutover_date: string;
  @Column({ type: 'varchar', length: 12, default: 'draft' })
  status: LeaveCutoverStatus;
  @Column({ type: 'varchar', length: 64, nullable: true })
  rows_sha256: string | null;
  @Column({ type: 'int' }) created_by_company_user_id: number;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
  @Column({ type: 'int', nullable: true })
  approved_by_company_user_id: number | null;
  @Column({ type: 'timestamptz', nullable: true }) approved_at: Date | null;
  @Column({ type: 'text', nullable: true }) approval_reason: string | null;
  /** Evidence reference(s): signed reconciliation file, minutes, etc. */
  @Column({ type: 'text', nullable: true }) approval_evidence: string | null;
  @Column({ type: 'int', nullable: true })
  posted_by_company_user_id: number | null;
  @Column({ type: 'timestamptz', nullable: true }) posted_at: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) closed_at: Date | null;
  @Column({ type: 'text', nullable: true }) close_reason: string | null;
}

@Entity('leave_cutover_rows')
@Index('IDX_leave_cutover_row_snapshot', ['snapshot_id', 'employee_id'])
@Unique('UQ_leave_cutover_row', ['snapshot_id', 'employee_id', 'family'])
export class LeaveCutoverRow {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) snapshot_id: number;
  @Column({ type: 'int' }) company_id: number;
  @Column({ type: 'int' }) employee_id: number;
  @Column({ type: 'int' }) leave_type_id: number;
  @Column({ type: 'varchar', length: 20 }) family: 'annual' | 'sick' | 'compassionate';
  @Column({ type: 'date' }) cycle_anchor: string;
  @Column({ type: 'date' }) cycle_start: string;
  @Column({ type: 'date', nullable: true }) prior_cycle_start: string | null;
  @Column({ type: 'numeric', precision: 12, scale: 4, default: 0 })
  prior_carry_days: string;
  @Column({ type: 'date', nullable: true }) carry_expires_on: string | null;
  @Column({ type: 'numeric', precision: 12, scale: 4, default: 0 })
  accrued_days: string;
  @Column({ type: 'numeric', precision: 12, scale: 4, default: 0 })
  taken_days: string;
  /** Pending and approved future days (not taken; posted as reservations/scheduled). */
  @Column({ type: 'numeric', precision: 12, scale: 4, default: 0 })
  outstanding_days: string;
  @Column({ type: 'numeric', precision: 12, scale: 4 }) proposed_days: string;
  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true })
  override_days: string | null;
  @Column({ type: 'text', nullable: true }) override_reason: string | null;
  @Column({ type: 'jsonb' }) exceptions: string[];
  @Column({ type: 'jsonb' }) sources: Record<string, unknown>;
  @Column({ type: 'varchar', length: 64 }) source_fingerprint: string;
  @Column({ default: false }) resolved: boolean;
}
