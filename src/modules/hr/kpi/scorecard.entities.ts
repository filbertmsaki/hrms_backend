import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type ScorecardSubject =
  | 'employee'
  | 'department'
  | 'branch'
  | 'manager_group'
  | 'organization';
export type ScorecardMode = 'weighted' | 'strategic';
export type ScorecardState = 'draft' | 'published' | 'active' | 'archived';
export type RatingBand = { label: string; from: number; to: number };
export type ScorecardEntryConfig = {
  assignmentId: number;
  definitionVersionId: number;
  targetRevisionId: number;
  weight: string;
  required: boolean;
};

@Entity('phase2_scoring_policies')
@Unique('UQ_phase2_policy_code', ['companyId', 'code'])
export class ScoringPolicy {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ type: 'varchar', length: 80 }) code: string;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase2_scoring_policy_versions')
@Unique('UQ_phase2_policy_version', ['policyId', 'version'])
export class ScoringPolicyVersion {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'policy_id', type: 'int' }) policyId: number;
  @Column({ type: 'int' }) version: number;
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ type: 'varchar', length: 30, default: 'weighted' })
  method: ScorecardMode;
  @Column({ name: 'config', type: 'jsonb' }) config: Record<string, unknown>;
  @Column({ name: 'rating_bands', type: 'jsonb' }) ratingBands: RatingBand[];
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase2_scorecards')
@Unique('UQ_phase2_scorecard_code', ['companyId', 'code'])
@Index('IDX_phase2_scorecard_subject', [
  'companyId',
  'subjectType',
  'subjectId',
])
export class Scorecard {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ type: 'varchar', length: 80 }) code: string;
  @Column({ name: 'subject_type', type: 'varchar', length: 30 })
  subjectType: ScorecardSubject;
  @Column({ name: 'subject_id', type: 'int' }) subjectId: number;
  @Column({ name: 'period_id', type: 'int' }) periodId: number;
  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;
  @Column({ name: 'organization_snapshot', type: 'jsonb' })
  organizationSnapshot: Record<string, unknown>;
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: ScorecardState;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('phase2_scorecard_versions')
@Unique('UQ_phase2_scorecard_version', ['scorecardId', 'version'])
export class ScorecardVersion {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'scorecard_id', type: 'int' }) scorecardId: number;
  @Column({ type: 'int' }) version: number;
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'varchar', length: 20 }) mode: ScorecardMode;
  @Column({ name: 'policy_version_id', type: 'int', nullable: true })
  policyVersionId: number | null;
  @Column({ type: 'jsonb' }) entries: ScorecardEntryConfig[];
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase2_scorecard_templates')
@Unique('UQ_phase2_scorecard_template_code', ['companyId', 'code'])
export class ScorecardTemplate {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ type: 'varchar', length: 80 }) code: string;
  @Column({ type: 'varchar', length: 160 }) name: string;
  @Column({ type: 'varchar', length: 20 }) mode: ScorecardMode;
  @Column({ name: 'policy_version_id', type: 'int', nullable: true })
  policyVersionId: number | null;
  @Column({ type: 'jsonb' }) items: Array<{
    definitionId: number;
    weight: string;
  }>;
  @Column({ type: 'varchar', length: 20, default: 'draft' }) status:
    | 'draft'
    | 'published';
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
