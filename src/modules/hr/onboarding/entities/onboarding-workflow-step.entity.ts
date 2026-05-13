import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Role } from '../../../roles/entities/role.entity';
import { Department } from '../../departments/entities/department.entity';
import { Position } from '../../positions/entities/position.entity';
import { OnboardingApprovalActionTypeEnum } from '../enums/onboarding-approval-action-type.enum';
import { OnboardingApproverTypeEnum } from '../enums/onboarding-approver-type.enum';
import { OnboardingTaskTypeEnum } from '../enums/onboarding-task-type.enum';
import { OnboardingApproval } from './onboarding-approval.entity';
import { OnboardingTask } from './onboarding-task.entity';
import { OnboardingWorkflow } from './onboarding-workflow.entity';

@Entity('onboarding_workflow_steps')
@Unique('UQ_onboarding_workflow_step_workflow_level', ['workflow_id', 'approval_level'])
@Index('IDX_onboarding_workflow_step_workflow', ['workflow_id'])
@Index('IDX_onboarding_workflow_step_role', ['role_id'])
@Index('IDX_onboarding_workflow_step_position', ['position_id'])
@Index('IDX_onboarding_workflow_step_company_user', ['company_user_id'])
@Index('IDX_onboarding_workflow_step_department', ['assigned_department_id'])
export class OnboardingWorkflowStep {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  workflow_id: number;

  @Column({ type: 'int' })
  approval_level: number;

  @Column({ type: 'varchar', length: 120 })
  step_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  task_title: string | null;

  @Column({ type: 'text', nullable: true })
  task_description: string | null;

  @Column({
    type: 'enum',
    enum: OnboardingTaskTypeEnum,
    default: OnboardingTaskTypeEnum.GENERAL,
  })
  task_type: OnboardingTaskTypeEnum;

  @Column({ type: 'int', nullable: true })
  assigned_department_id: number | null;

  @Column({
    type: 'enum',
    enum: OnboardingApproverTypeEnum,
  })
  approver_type: OnboardingApproverTypeEnum;

  @Column({ type: 'int', nullable: true })
  role_id: number | null;

  @Column({ type: 'int', nullable: true })
  position_id: number | null;

  @Column({ type: 'int', nullable: true })
  company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: OnboardingApprovalActionTypeEnum,
  })
  action_type: OnboardingApprovalActionTypeEnum;

  @Column({ default: true })
  is_required: boolean;

  @Column({ type: 'int', nullable: true })
  expected_duration_days: number | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => OnboardingWorkflow, (workflow) => workflow.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflow_id' })
  workflow: OnboardingWorkflow;

  @ManyToOne(() => Department, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_department_id' })
  assigned_department: Department | null;

  @ManyToOne(() => Role, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'role_id' })
  role: Role | null;

  @ManyToOne(() => Position, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'position_id' })
  position: Position | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'company_user_id' })
  company_user: CompanyUser | null;

  @OneToMany(() => OnboardingApproval, (approval) => approval.workflow_step)
  onboarding_approvals: OnboardingApproval[];

  @OneToMany(() => OnboardingTask, (task) => task.workflow_step)
  onboarding_tasks: OnboardingTask[];
}
