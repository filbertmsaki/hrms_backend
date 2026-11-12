import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { KpiFrequency } from './kpi.entities';

export type EvaluationStatus =
  | 'self_draft'
  | 'self_submitted'
  | 'self_returned'
  | 'manager_draft'
  | 'manager_submitted'
  | 'hr_reviewed'
  | 'approved'
  | 'finalized'
  | 'cancelled';

@Entity('phase4_evaluation_templates')
@Unique('UQ_phase4_template_code', ['companyId', 'code'])
export class EvaluationTemplate {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ type: 'varchar', length: 80 }) code: string;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase4_evaluation_template_versions')
@Unique('UQ_phase4_template_version', ['templateId', 'version'])
export class EvaluationTemplateVersion {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'template_id', type: 'int' }) templateId: number;
  @Column({ type: 'int' }) version: number;
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ type: 'jsonb' }) config: {
    competencies: Array<{ code: string; name: string; description?: string }>;
    scale: Array<{ value: number; label: string; description?: string }>;
    requireHrReview: boolean;
    sectionWeights?: { kpi: number; competency: number } | null;
  };
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase4_evaluation_cycles')
@Unique('UQ_phase4_cycle_code', ['companyId', 'code'])
export class EvaluationCycle {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ type: 'varchar', length: 80 }) code: string;
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ type: 'varchar', length: 20 }) frequency: KpiFrequency;
  @Column({ name: 'period_id', type: 'int' }) periodId: number;
  @Column({ name: 'template_version_id', type: 'int' })
  templateVersionId: number;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'end_date', type: 'date' }) endDate: string;
  @Column({ name: 'self_deadline', type: 'date', nullable: true })
  selfDeadline: string | null;
  @Column({ name: 'manager_deadline', type: 'date', nullable: true })
  managerDeadline: string | null;
  @Column({ name: 'hr_deadline', type: 'date', nullable: true }) hrDeadline:
    | string
    | null;
  @Column({ name: 'ack_deadline', type: 'date', nullable: true }) ackDeadline:
    | string
    | null;
  @Column({ name: 'hr_reviewer_company_user_id', type: 'int', nullable: true })
  hrReviewerCompanyUserId: number | null;
  @Column({
    name: 'deadline_policy',
    type: 'jsonb',
    default: () => '\'{"mode":"soft"}\'::jsonb',
  })
  deadlinePolicy: {
    mode: 'soft' | 'hard';
    policyId?: string;
    approvedBy?: number;
    approvedAt?: string;
    configuredBy?: number;
    reason?: string;
  };
  @Column({ type: 'varchar', length: 20, default: 'draft' }) status:
    | 'draft'
    | 'open'
    | 'in_progress'
    | 'review'
    | 'closed';
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('phase4_evaluations')
@Index('IDX_phase4_eval_employee', ['companyId', 'employeeId'])
export class PerformanceEvaluation {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'cycle_id', type: 'int' }) cycleId: number;
  @Column({ name: 'employee_id', type: 'int' }) employeeId: number;
  @Column({ name: 'manager_employee_id', type: 'int' })
  managerEmployeeId: number;
  @Column({ name: 'hr_reviewer_company_user_id', type: 'int', nullable: true })
  hrReviewerCompanyUserId: number | null;
  @Column({ name: 'scorecard_id', type: 'int' }) scorecardId: number;
  @Column({ name: 'template_version_id', type: 'int' })
  templateVersionId: number;
  @Column({ name: 'organization_snapshot', type: 'jsonb' })
  organizationSnapshot: Record<string, unknown>;
  @Column({ name: 'amended_from_id', type: 'int', nullable: true })
  amendedFromId: number | null;
  @Column({ type: 'varchar', length: 30, default: 'self_draft' })
  status: EvaluationStatus;
  @Column({ name: 'row_version', type: 'int', default: 1 }) rowVersion: number;
  @Column({ name: 'self_data', type: 'jsonb', nullable: true })
  selfData: Record<string, unknown> | null;
  @Column({ name: 'manager_data', type: 'jsonb', nullable: true })
  managerData: Record<string, unknown> | null;
  @Column({ name: 'hr_comment', type: 'text', nullable: true }) hrComment:
    | string
    | null;
  @Column({ name: 'final_snapshot', type: 'jsonb', nullable: true })
  finalSnapshot: Record<string, unknown> | null;
  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;
  @Column({ name: 'ack_status', type: 'varchar', length: 20, nullable: true })
  ackStatus: 'acknowledged' | 'disputed' | null;
  @Column({ name: 'ack_comment', type: 'text', nullable: true }) ackComment:
    | string
    | null;
  @Column({ name: 'ack_at', type: 'timestamptz', nullable: true })
  ackAt: Date | null;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('phase4_evaluation_revisions')
@Unique('UQ_phase4_eval_revision', ['evaluationId', 'section', 'revision'])
export class EvaluationRevision {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'evaluation_id', type: 'int' }) evaluationId: number;
  @Column({ type: 'varchar', length: 20 }) section: 'self' | 'manager' | 'hr';
  @Column({ type: 'int' }) revision: number;
  @Column({ type: 'jsonb' }) data: Record<string, unknown>;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase4_evaluation_events')
export class EvaluationEvent {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'evaluation_id', type: 'int' }) evaluationId: number;
  @Column({ type: 'varchar', length: 50 }) action: string;
  @Column({ name: 'actor_id', type: 'int' }) actorId: number;
  @Column({ type: 'jsonb', default: {} }) details: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase4_evaluation_deadline_exceptions')
@Unique('UQ_phase4_deadline_exception', ['evaluationId', 'stage'])
export class EvaluationDeadlineException {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'evaluation_id', type: 'int' }) evaluationId: number;
  @Column({ type: 'varchar', length: 20 }) stage:
    | 'self'
    | 'manager'
    | 'hr'
    | 'ack';
  @Column({ type: 'text' }) reason: string;
  @Column({ name: 'approved_by', type: 'int' }) approvedBy: number;
  @CreateDateColumn({ name: 'approved_at', type: 'timestamptz' })
  approvedAt: Date;
}
