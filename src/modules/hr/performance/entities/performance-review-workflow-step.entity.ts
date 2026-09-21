import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { PerformanceWorkflowStepTypeEnum } from '../enums/performance-workflow-step-type.enum';
import { PerformancePeriodAssignment } from './performance-period-assignment.entity';
import { PerformanceReview } from './performance-review.entity';
import { PerformanceWorkflowConfig } from './performance-workflow-config.entity';

export enum PerformanceReviewWorkflowStepStatusEnum {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  RETURNED = 'RETURNED',
  REJECTED = 'REJECTED',
  SKIPPED = 'SKIPPED',
}

@Entity('performance_review_workflow_steps')
@Unique('UQ_performance_review_workflow_step_sequence', [
  'performanceReviewId',
  'sequenceNumber',
])
@Index('IDX_performance_review_workflow_company_review', [
  'companyId',
  'performanceReviewId',
])
@Index('IDX_performance_review_workflow_assigned_status', [
  'companyId',
  'assignedEmployeeId',
  'status',
])
export class PerformanceReviewWorkflowStep {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_review_id', type: 'int' })
  performanceReviewId: number;

  @Column({ name: 'period_assignment_id', type: 'int' })
  periodAssignmentId: number;

  @Column({ name: 'workflow_config_id', type: 'int', nullable: true })
  workflowConfigId: number | null;

  @Column({ name: 'sequence_number', type: 'int' })
  sequenceNumber: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  label: string;

  @Column({
    name: 'step_type',
    type: 'varchar',
    length: 60,
  })
  stepType: PerformanceWorkflowStepTypeEnum;

  @Column({ type: 'varchar', length: 30 })
  status: PerformanceReviewWorkflowStepStatusEnum;

  @Column({ name: 'assigned_employee_id', type: 'int', nullable: true })
  assignedEmployeeId: number | null;

  @Column({ name: 'assigned_company_user_id', type: 'int', nullable: true })
  assignedCompanyUserId: number | null;

  @Column({ name: 'acted_by_employee_id', type: 'int', nullable: true })
  actedByEmployeeId: number | null;

  @Column({ name: 'acted_by_company_user_id', type: 'int', nullable: true })
  actedByCompanyUserId: number | null;

  @Column({ name: 'action_comment', type: 'text', nullable: true })
  actionComment: string | null;

  @Column({ name: 'action_at', type: 'timestamptz', nullable: true })
  actionAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => PerformanceReview, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'performance_review_id' })
  review: PerformanceReview;

  @ManyToOne(() => PerformancePeriodAssignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_assignment_id' })
  assignment: PerformancePeriodAssignment;

  @ManyToOne(() => PerformanceWorkflowConfig, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workflow_config_id' })
  workflowConfig: PerformanceWorkflowConfig | null;
}
