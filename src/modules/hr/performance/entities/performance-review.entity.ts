import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';
import { PerformanceReviewStatusEnum } from '../enums/performance-review-status.enum';
import { PerformancePeriodAssignment } from './performance-period-assignment.entity';

@Entity('performance_reviews')
@Unique('UQ_performance_review_period_employee', [
  'performancePeriodId',
  'employeeId',
])
@Index('IDX_performance_review_company_status', ['companyId', 'status'])
export class PerformanceReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_period_id', type: 'int' })
  performancePeriodId: number;

  @Column({ name: 'period_assignment_id', type: 'int' })
  periodAssignmentId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({
    name: 'manager_company_user_id',
    type: 'int',
    nullable: true,
  })
  managerCompanyUserId: number | null;

  @Column({
    type: 'enum',
    enum: PerformanceReviewStatusEnum,
    enumName: 'performance_review_status_enum',
    default: PerformanceReviewStatusEnum.DRAFT,
  })
  status: PerformanceReviewStatusEnum;

  @Column({
    name: 'kpi_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
  })
  kpiScore: string | null;

  @Column({
    name: 'competency_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
  })
  competencyScore: string | null;

  @Column({
    name: 'adjustment_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
    default: 0,
  })
  adjustmentScore: string;

  @Column({
    name: 'final_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
  })
  finalScore: string | null;

  @Column({ name: 'rating_scale_id', type: 'int', nullable: true })
  ratingScaleId: number | null;

  @Column({ name: 'rating_band_id', type: 'int', nullable: true })
  ratingBandId: number | null;

  @Column({ name: 'rating_code', type: 'varchar', length: 40, nullable: true })
  ratingCode: string | null;

  @Column({ name: 'employee_self_review', type: 'jsonb', nullable: true })
  employeeSelfReview: Record<string, unknown> | null;

  @Column({ name: 'manager_review', type: 'jsonb', nullable: true })
  managerReview: Record<string, unknown> | null;

  @Column({ name: 'hr_review', type: 'jsonb', nullable: true })
  hrReview: Record<string, unknown> | null;

  @Column({ name: 'moderation_snapshot', type: 'jsonb', nullable: true })
  moderationSnapshot: Record<string, unknown> | null;

  @Column({ name: 'areas_of_strength', type: 'jsonb', nullable: true })
  areasOfStrength: string[] | null;

  @Column({ name: 'areas_for_improvement', type: 'jsonb', nullable: true })
  areasForImprovement: string[] | null;

  @Column({ name: 'training_needs', type: 'jsonb', nullable: true })
  trainingNeeds: string[] | null;

  @Column({ name: 'recommendations', type: 'jsonb', nullable: true })
  recommendations: string[] | null;

  @Column({
    name: 'appeal_deadline_at',
    type: 'timestamptz',
    nullable: true,
  })
  appealDeadlineAt: Date | null;

  @Column({ name: 'calculation_snapshot', type: 'jsonb', nullable: true })
  calculationSnapshot: Record<string, unknown> | null;

  @Column({
    name: 'calculation_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  calculationHash: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'revision_number', type: 'int', default: 1 })
  revisionNumber: number;

  @VersionColumn()
  version: number;

  @ManyToOne(() => PerformancePeriodAssignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_assignment_id' })
  periodAssignment: PerformancePeriodAssignment;
}
