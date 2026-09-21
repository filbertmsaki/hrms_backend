import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { PerformanceFeedback360RelationshipEnum } from '../enums/performance-feedback-360-relationship.enum';
import { PerformanceFeedback360StatusEnum } from '../enums/performance-feedback-360-status.enum';

@Entity('performance_feedback_360_requests')
@Unique('UQ_performance_feedback_360_review_rater', [
  'performanceReviewId',
  'raterEmployeeId',
])
@Index('IDX_performance_feedback_360_company_status', ['companyId', 'status'])
@Index('IDX_performance_feedback_360_rater', ['companyId', 'raterEmployeeId'])
export class PerformanceFeedback360Request {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_review_id', type: 'int' })
  performanceReviewId: number;

  @Column({ name: 'subject_employee_id', type: 'int' })
  subjectEmployeeId: number;

  @Column({ name: 'rater_employee_id', type: 'int' })
  raterEmployeeId: number;

  @Column({
    name: 'relationship_type',
    type: 'enum',
    enum: PerformanceFeedback360RelationshipEnum,
    enumName: 'performance_feedback_360_relationship_enum',
  })
  relationshipType: PerformanceFeedback360RelationshipEnum;

  @Column({
    type: 'enum',
    enum: PerformanceFeedback360StatusEnum,
    enumName: 'performance_feedback_360_status_enum',
    default: PerformanceFeedback360StatusEnum.PENDING,
  })
  status: PerformanceFeedback360StatusEnum;

  @Column({ name: 'is_anonymous', type: 'boolean', default: true })
  isAnonymous: boolean;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'ratings', type: 'jsonb', nullable: true })
  ratings: Record<string, number> | null;

  @Column({
    name: 'overall_score',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  overallScore: string | null;

  @Column({ name: 'strengths', type: 'text', nullable: true })
  strengths: string | null;

  @Column({ name: 'improvement_areas', type: 'text', nullable: true })
  improvementAreas: string | null;

  @Column({ name: 'comments', type: 'text', nullable: true })
  comments: string | null;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason: string | null;

  @Column({ name: 'invited_by_company_user_id', type: 'int', nullable: true })
  invitedByCompanyUserId: number | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
