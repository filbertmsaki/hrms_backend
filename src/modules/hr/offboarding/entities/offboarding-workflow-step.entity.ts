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
import { Branch } from '../../branches/entities/branch.entity';
import { Department } from '../../departments/entities/department.entity';
import { Position } from '../../positions/entities/position.entity';
import { OffboardingApprovalActionTypeEnum } from '../enums/offboarding-approval-action-type.enum';
import { OffboardingApproverTypeEnum } from '../enums/offboarding-approver-type.enum';
import { OffboardingTaskTypeEnum } from '../enums/offboarding-task-type.enum';
import { OffboardingApproval } from './offboarding-approval.entity';
import { OffboardingTask } from './offboarding-task.entity';
import { OffboardingWorkflow } from './offboarding-workflow.entity';

@Entity('offboarding_workflow_steps')
@Unique('UQ_offboarding_workflow_step_workflow_level', ['workflow_id', 'approval_level'])
@Index('IDX_offboarding_workflow_step_workflow', ['workflow_id'])
@Index('IDX_offboarding_workflow_step_role', ['role_id'])
@Index('IDX_offboarding_workflow_step_position', ['position_id'])
@Index('IDX_offboarding_workflow_step_company_user', ['company_user_id'])
@Index('IDX_offboarding_workflow_step_branch', ['assigned_branch_id'])
@Index('IDX_offboarding_workflow_step_department', ['assigned_department_id'])
export class OffboardingWorkflowStep {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  workflow_id: number;

  @Column({ type: 'int' })
  approval_level: number;

  @Column({ type: 'varchar', length: 120 })
  step_name: string;

  @Column({ type: 'varchar', length: 255 })
  task_title: string;

  @Column({ type: 'text', nullable: true })
  task_description: string | null;

  @Column({
    type: 'enum',
    enum: OffboardingTaskTypeEnum,
    default: OffboardingTaskTypeEnum.GENERAL,
  })
  task_type: OffboardingTaskTypeEnum;

  @Column({ type: 'int', nullable: true })
  assigned_branch_id: number | null;

  @Column({ type: 'int', nullable: true })
  assigned_department_id: number | null;

  @Column({
    type: 'enum',
    enum: OffboardingApproverTypeEnum,
  })
  approver_type: OffboardingApproverTypeEnum;

  @Column({ type: 'int', nullable: true })
  role_id: number | null;

  @Column({ type: 'int', nullable: true })
  position_id: number | null;

  @Column({ type: 'int', nullable: true })
  company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: OffboardingApprovalActionTypeEnum,
  })
  action_type: OffboardingApprovalActionTypeEnum;

  @Column({ default: true })
  is_required: boolean;

  @Column({ type: 'int', nullable: true })
  expected_duration_days: number | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => OffboardingWorkflow, (workflow) => workflow.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflow_id' })
  workflow: OffboardingWorkflow;

  @ManyToOne(() => Branch, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_branch_id' })
  assigned_branch: Branch | null;

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

  @OneToMany(() => OffboardingApproval, (approval) => approval.workflow_step)
  offboarding_approvals: OffboardingApproval[];

  @OneToMany(() => OffboardingTask, (task) => task.workflow_step)
  offboarding_tasks: OffboardingTask[];
}
