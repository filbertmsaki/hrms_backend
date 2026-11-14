import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** One row per company per day; operators see failures and retries here. */
@Entity('leave_cycle_job_runs')
@Unique('UQ_leave_cycle_job_run', ['company_id', 'run_date'])
export class LeaveCycleJobRun {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) company_id: number;
  @Column({ type: 'date' }) run_date: string;
  @Column({ type: 'varchar', length: 12 }) status:
    | 'running'
    | 'succeeded'
    | 'failed';
  @Column({ type: 'int', default: 1 }) attempts: number;
  @Column({ type: 'timestamptz', default: () => 'now()' }) started_at: Date;
  @Column({ type: 'timestamptz', nullable: true }) finished_at: Date | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'jsonb', nullable: true }) stats: Record<
    string,
    unknown
  > | null;
}

/** Deduplicates leave notifications (one per key per company, ever). */
@Entity('leave_notification_log')
@Unique('UQ_leave_notification_log', ['company_id', 'dedupe_key'])
export class LeaveNotificationLog {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) company_id: number;
  @Column({ type: 'varchar', length: 200 }) dedupe_key: string;
  @Column({ type: 'jsonb' }) recipients: number[];
  @Column({ type: 'timestamptz', default: () => 'now()' }) created_at: Date;
}
