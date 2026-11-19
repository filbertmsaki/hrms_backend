import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { LeaveRolloverRun } from './leave-rollover-run.entity';

export type LeaveRolloverException = {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
};

/** One employee balance in a rollover: how its unused days are treated. */
@Entity('leave_rollover_lines')
@Unique('UQ_leave_rollover_line', ['run_id', 'employee_id', 'leave_type_id'])
@Index('IDX_leave_rollover_line_balance', ['source_balance_id'])
export class LeaveRolloverLine {
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

  @Column()
  source_balance_id: number;

  @Column({ type: 'int', nullable: true })
  target_balance_id: number | null;

  @Column({ type: 'int', nullable: true })
  policy_id: number | null;

  @Column({ type: 'int', nullable: true })
  policy_version_no: number | null;

  @Column({ type: 'int', nullable: true })
  statutory_rule_set_id: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  opening_days: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  accrued_days: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  used_days: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  unused_days: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  protected_days: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  carry_forward_days: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  encash_days: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  lapse_days: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  retained_days: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  closing_days: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  encash_amount: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  encash_daily_rate: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: 'pending' | 'posted' | 'failed' | 'skipped';

  @Column({ type: 'jsonb', default: () => "'[]'" })
  exceptions: LeaveRolloverException[];

  @Column({ type: 'jsonb', nullable: true })
  calculation: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', nullable: true })
  encashment_request_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  posted_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => LeaveRolloverRun, (run) => run.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'run_id' })
  run?: LeaveRolloverRun;
}
