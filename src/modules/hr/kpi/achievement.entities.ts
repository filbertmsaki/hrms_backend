import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type AchievementStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'returned'
  | 'rejected'
  | 'approved'
  | 'superseded';

@Entity('phase3_kpi_achievements')
@Unique('UQ_phase3_achievement_assignment', ['assignmentId'])
export class KpiAchievement {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'assignment_id', type: 'int' }) assignmentId: number;
  @Column({ name: 'latest_revision_id', type: 'int', nullable: true })
  latestRevisionId: number | null;
  @Column({ name: 'approved_revision_id', type: 'int', nullable: true })
  approvedRevisionId: number | null;
  @Column({ name: 'created_by', type: 'int' }) createdBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('phase3_kpi_achievement_revisions')
@Unique('UQ_phase3_achievement_revision', ['achievementId', 'revision'])
@Index('IDX_phase3_achievement_status', ['companyId', 'status'])
export class KpiAchievementRevision {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'achievement_id', type: 'int' }) achievementId: number;
  @Column({ type: 'int' }) revision: number;
  @Column({ type: 'varchar', length: 24, default: 'draft' })
  status: AchievementStatus;
  @Column({ type: 'jsonb', nullable: true }) actual: unknown;
  @Column({ type: 'text', nullable: true }) comments: string | null;
  @Column({ name: 'definition_version_id', type: 'int' })
  definitionVersionId: number;
  @Column({ name: 'target_revision_id', type: 'int' }) targetRevisionId: number;
  @Column({ name: 'period_id', type: 'int' }) periodId: number;
  @Column({ name: 'evidence_required', type: 'boolean', default: false })
  evidenceRequired: boolean;
  @Column({ name: 'submitted_by', type: 'int' }) submittedBy: number;
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;
  @Column({ name: 'reviewed_by', type: 'int', nullable: true }) reviewedBy:
    | number
    | null;
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment: string | null;
  @Column({ name: 'row_version', type: 'int', default: 1 }) rowVersion: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('phase3_kpi_achievement_evidence')
export class KpiAchievementEvidence {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'revision_id', type: 'int' }) revisionId: number;
  @Column({ name: 'private_path', type: 'text', select: false })
  privatePath: string;
  @Column({ name: 'file_name', type: 'varchar', length: 255 }) fileName: string;
  @Column({ name: 'mime_type', type: 'varchar', length: 150 }) mimeType: string;
  @Column({ name: 'file_size', type: 'int' }) fileSize: number;
  @Column({ name: 'uploaded_by', type: 'int' }) uploadedBy: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase3_kpi_achievement_events')
export class KpiAchievementEvent {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'achievement_id', type: 'int' }) achievementId: number;
  @Column({ name: 'revision_id', type: 'int' }) revisionId: number;
  @Column({ type: 'varchar', length: 40 }) action: string;
  @Column({ name: 'actor_id', type: 'int' }) actorId: number;
  @Column({ type: 'jsonb', default: {} }) details: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('phase3_kpi_evidence_rules')
@Unique('UQ_phase3_evidence_definition', ['definitionVersionId'])
export class KpiEvidenceRule {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'definition_version_id', type: 'int' })
  definitionVersionId: number;
  @Column({ type: 'boolean', default: false }) required: boolean;
  @Column({ name: 'changed_by', type: 'int' }) changedBy: number;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
