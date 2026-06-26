import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
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
    default: OnboardingTaskTypeEnum.GENERAL,
  })
  task_type: OnboardingTaskTypeEnum;

  @Column({
    type: 'enum',
    enum: OnboardingTaskStatusEnum,
    default: OnboardingTaskStatusEnum.PENDING,
  })
  status: OnboardingTaskStatusEnum;

  @Column({ type: 'int', nullable: true })
  assigned_department_id: number | null;

  @Column({ type: 'int', nullable: true })
  assigned_company_user_id: number | null;

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

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  completed_by_company_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

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
