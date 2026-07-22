import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReportAttemptStatusEnum } from '../enums/report-attempt-status.enum';
import { ReportExecutionAttemptPhaseEnum } from '../enums/report-execution-attempt-phase.enum';
import { ReportExecution } from './report-execution.entity';

/**
 * Per-phase attempt log for report generation and email delivery retries. This
 * captures transient failures without overwriting the main execution record.
 */
@Entity('report_execution_attempts')
@Index('IDX_report_execution_attempts_execution_id', ['executionId'])
@Index('IDX_report_execution_attempts_phase', ['phase'])
@Index('IDX_report_execution_attempts_status', ['status'])
@Index(
  'UQ_report_execution_attempts_execution_phase_attempt',
  ['executionId', 'phase', 'attemptNumber'],
  { unique: true },
)
export class ReportExecutionAttempt {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'execution_id', type: 'int' })
  executionId: number;

  @Column({ name: 'attempt_number', type: 'int' })
  attemptNumber: number;

  @Column({
    name: 'phase',
    type: 'enum',
    enum: ReportExecutionAttemptPhaseEnum,
    enumName: 'report_execution_attempt_phase_enum',
  })
  phase: ReportExecutionAttemptPhaseEnum;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ReportAttemptStatusEnum,
    enumName: 'report_attempt_status_enum',
    default: ReportAttemptStatusEnum.PENDING,
  })
  status: ReportAttemptStatusEnum;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'technical_details', type: 'text', nullable: true })
  technicalDetails: string | null;

  @Column({
    name: 'metadata',
    type: 'jsonb',
    nullable: true,
    comment:
      'Structured attempt metadata such as backoff details or provider responses.',
  })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => ReportExecution, (execution) => execution.attempts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'execution_id' })
  execution: ReportExecution;
}
