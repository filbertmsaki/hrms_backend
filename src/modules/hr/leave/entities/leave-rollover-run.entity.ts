import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LeaveRolloverLine } from './leave-rollover-line.entity';

export type LeaveRolloverRunStatus =
  | 'draft'
  | 'previewed'
  | 'pending_approval'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'partially_failed'
  | 'failed'
  | 'cancelled';

/** A year-end rollover for one company and leave year (optionally one type). */
@Entity('leave_rollover_runs')
// One open run per company, year and scope (company-wide or one leave type).
@Index('UQ_leave_rollover_open_run_all', ['company_id', 'from_leave_year'], {
  unique: true,
  where: `"leave_type_id" IS NULL AND "status" NOT IN ('cancelled', 'failed', 'completed', 'partially_failed')`,
})
@Index(
  'UQ_leave_rollover_open_run_type',
  ['company_id', 'from_leave_year', 'leave_type_id'],
  {
    unique: true,
    where: `"leave_type_id" IS NOT NULL AND "status" NOT IN ('cancelled', 'failed', 'completed', 'partially_failed')`,
  },
)
export class LeaveRolloverRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  /** The leave year being closed (balance fiscal_year label). */
  @Column({ type: 'varchar', length: 4 })
  from_leave_year: string;

  @Column({ type: 'int', nullable: true })
  leave_type_id: number | null;

  @Column({ type: 'varchar', length: 24, default: 'draft' })
  status: LeaveRolloverRunStatus;

  @Column({ type: 'varchar', length: 20, default: 'manual_approval' })
  execution_mode: 'manual_approval' | 'automatic';

  /** Date the preview was calculated for (normally the year-end date). */
  @Column({ type: 'date' })
  as_of_date: string;

  @Column({ type: 'jsonb', nullable: true })
  totals: Record<string, number> | null;

  @Column({ type: 'int', default: 0 })
  exception_count: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  submitted_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  submitted_at: Date | null;

  @Column({ type: 'int', nullable: true })
  approved_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  processing_started_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'text', nullable: true })
  cancel_reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => LeaveRolloverLine, (line) => line.run)
  lines?: LeaveRolloverLine[];
}
