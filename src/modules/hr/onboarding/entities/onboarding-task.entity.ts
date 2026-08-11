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
import { Department } from '../../departments/entities/department.entity';
import { OnboardingTaskStatusEnum } from '../enums/onboarding-task-status.enum';
import { OnboardingTaskTypeEnum } from '../enums/onboarding-task-type.enum';
import { OnboardingRequest } from './onboarding-request.entity';
import { OnboardingWorkflowStep } from './onboarding-workflow-step.entity';

@Entity('onboarding_tasks')
@Index('IDX_onboarding_task_request', ['onboarding_request_id'])
@Index('IDX_onboarding_task_status', ['status'])
@Index('IDX_onboarding_task_department', ['assigned_department_id'])
@Index('IDX_onboarding_task_assignee', ['assigned_company_user_id'])
export class OnboardingTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  onboarding_request_id: number;

  @Column({ type: 'int', nullable: true })
  workflow_step_id: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  task_no: string | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: OnboardingTaskTypeEnum,
    enumName: 'onboarding_tasks_task_type_enum',
    default: OnboardingTaskTypeEnum.GENERAL,
  })
  task_type: OnboardingTaskTypeEnum;

  @Column({
    type: 'enum',
    enum: OnboardingTaskStatusEnum,
    default: OnboardingTaskStatusEnum.PENDING,
  })
  status: OnboardingTaskStatusEnum;

  @Column({ default: true })
  is_required: boolean;

  @Column({ type: 'int', nullable: true })
  assigned_department_id: number | null;

  @Column({ type: 'int', nullable: true })
  assigned_company_user_id: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  required_document_type_code: string | null;

  @Column({ default: false })
  requires_verified_document: boolean;

  @Column({ default: false })
  completion_evidence_required: boolean;

  @Column({ type: 'int', nullable: true })
  evidence_document_id: number | null;

  @Column({ type: 'json', nullable: true })
  completion_data: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  due_date: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'text', nullable: true })
  completion_notes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  last_reminder_at: Date | null;

  @Column({ type: 'int', default: 0 })
  reminder_count: number;

  @Column({ type: 'timestamp', nullable: true })
  last_escalated_at: Date | null;

  @Column({ type: 'int', default: 0 })
  escalation_count: number;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  completed_by_company_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @VersionColumn()
  version: number;

  @ManyToOne(() => OnboardingRequest, (request) => request.tasks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'onboarding_request_id' })
  onboarding_request: OnboardingRequest;

  @ManyToOne(() => OnboardingWorkflowStep, (step) => step.onboarding_tasks, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'workflow_step_id' })
  workflow_step: OnboardingWorkflowStep | null;

  @ManyToOne(() => Department, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_department_id' })
  assigned_department: Department | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_company_user_id' })
  assigned_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  created_by_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'completed_by_company_user_id' })
  completed_by_company_user: CompanyUser | null;
}
