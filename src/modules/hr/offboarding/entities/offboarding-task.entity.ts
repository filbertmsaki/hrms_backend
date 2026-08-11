import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { OffboardingTaskPriorityEnum } from '../enums/offboarding-task-priority.enum';
import { OffboardingTaskStatusEnum } from '../enums/offboarding-task-status.enum';
import { OffboardingTaskTypeEnum } from '../enums/offboarding-task-type.enum';
import { OffboardingRequest } from './offboarding-request.entity';
import { OffboardingWorkflowStep } from './offboarding-workflow-step.entity';

@Entity('offboarding_tasks')
@Index('IDX_offboarding_task_company', ['company_id'])
@Index('IDX_offboarding_task_request', ['offboarding_request_id'])
@Index('IDX_offboarding_task_status', ['status'])
@Index('IDX_offboarding_task_assignee', ['assigned_to_company_user_id'])
@Index('IDX_offboarding_task_reopened_by', ['reopened_by_company_user_id'])
@Index('IDX_offboarding_task_reassigned_by', [
  'last_reassigned_by_company_user_id',
])
export class OffboardingTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  offboarding_request_id: number;

  @Column({ type: 'int', nullable: true })
  workflow_step_id: number | null;

  @Column({ type: 'int', nullable: true })
  assigned_to_company_user_id: number | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: OffboardingTaskTypeEnum,
    default: OffboardingTaskTypeEnum.GENERAL,
  })
  task_type: OffboardingTaskTypeEnum;

  @Column({
    type: 'enum',
    enum: OffboardingTaskStatusEnum,
    default: OffboardingTaskStatusEnum.PENDING,
  })
  status: OffboardingTaskStatusEnum;

  @Column({
    type: 'enum',
    enum: OffboardingTaskPriorityEnum,
    default: OffboardingTaskPriorityEnum.MEDIUM,
  })
  priority: OffboardingTaskPriorityEnum;

  @Column({ type: 'timestamp', nullable: true })
  due_date: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ default: true })
  is_required: boolean;

  @Column({ default: false })
  completion_evidence_required: boolean;

  @Column({ type: 'int', nullable: true })
  evidence_document_id: number | null;

  @Column({ type: 'jsonb', nullable: true })
  completion_data: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  completed_by_company_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  reopened_at: Date | null;

  @Column({ type: 'int', nullable: true })
  reopened_by_company_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  reassigned_at: Date | null;

  @Column({ type: 'int', nullable: true })
  last_reassigned_by_company_user_id: number | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_reminder_at: Date | null;

  @Column({ type: 'int', default: 0 })
  reminder_count: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_escalated_at: Date | null;

  @Column({ type: 'int', default: 0 })
  escalation_count: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @VersionColumn()
  version: number;

  @ManyToOne(() => OffboardingRequest, (request) => request.tasks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'offboarding_request_id' })
  offboarding_request: OffboardingRequest;

  @ManyToOne(() => OffboardingWorkflowStep, (step) => step.offboarding_tasks, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'workflow_step_id' })
  workflow_step: OffboardingWorkflowStep | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to_company_user_id' })
  assigned_to_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'completed_by_company_user_id' })
  completed_by_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reopened_by_company_user_id' })
  reopened_by_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'last_reassigned_by_company_user_id' })
  last_reassigned_by_company_user: CompanyUser | null;
}
