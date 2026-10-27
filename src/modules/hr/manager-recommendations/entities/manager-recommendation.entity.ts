import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ManagerRecommendationType {
  PROMOTION = 'PROMOTION',
  TRANSFER = 'TRANSFER',
  DISCIPLINARY = 'DISCIPLINARY',
}

export enum ManagerRecommendationStatus {
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
  WITHDRAWN = 'WITHDRAWN',
}

@Entity('manager_recommendations')
@Index('IDX_manager_recommendations_company_status', ['companyId', 'status'])
@Index('IDX_manager_recommendations_submitter', [
  'companyId',
  'submittedByCompanyUserId',
])
export class ManagerRecommendation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'submitted_by_company_user_id', type: 'int' })
  submittedByCompanyUserId: number;

  @Column({ name: 'recommendation_type', type: 'varchar', length: 24 })
  recommendationType: ManagerRecommendationType;

  @Column({ name: 'rationale', type: 'text' })
  rationale: string;

  @Column({ name: 'proposal', type: 'jsonb', default: () => "'{}'::jsonb" })
  proposal: Record<string, unknown>;

  @Column({ name: 'proposed_effective_date', type: 'date', nullable: true })
  proposedEffectiveDate: string | null;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'SUBMITTED' })
  status: ManagerRecommendationStatus;

  @Column({ name: 'reviewed_by_company_user_id', type: 'int', nullable: true })
  reviewedByCompanyUserId: number | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'reviewer_comment', type: 'text', nullable: true })
  reviewerComment: string | null;

  @Column({ name: 'demo_policy_version', type: 'varchar', length: 32 })
  demoPolicyVersion: string;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
