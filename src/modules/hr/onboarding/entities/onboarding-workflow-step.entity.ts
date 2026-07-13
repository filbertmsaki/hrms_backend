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
import { OnboardingStepTypeEnum } from '../enums/onboarding-step-type.enum';
import { OnboardingApproval } from './onboarding-approval.entity';
import { OnboardingTask } from './onboarding-task.entity';
import { OnboardingWorkflow } from './onboarding-workflow.entity';

@Entity('onboarding_workflow_steps')
@Unique('UQ_onboarding_workflow_step_workflow_order', [
  'workflow_id',
  'step_order',
])
@Index('IDX_onboarding_workflow_step_workflow', ['workflow_id'])
@Index('IDX_onboarding_workflow_step_role', ['assigned_role_id'])
@Index('IDX_onboarding_workflow_step_user', ['assigned_user_id'])
export class OnboardingWorkflowStep {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  workflow_id: number;

  @Column({ type: 'int' })
  step_order: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: OnboardingStepTypeEnum,
    default: OnboardingStepTypeEnum.TASK,
  })
  step_type: OnboardingStepTypeEnum;

  @Column({ type: 'int', nullable: true })
  assigned_role_id: number | null;

  @Column({ type: 'int', nullable: true })
  assigned_user_id: number | null;

  @Column({ default: true })
  is_required: boolean;

  @Column({ type: 'int', nullable: true })
  due_days: number | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => OnboardingWorkflow, (workflow) => workflow.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflow_id' })
  workflow: OnboardingWorkflow;

  @ManyToOne(() => Role, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_role_id' })
  assigned_role: Role | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_user_id' })
  assigned_user: CompanyUser | null;

  @OneToMany(() => OnboardingApproval, (approval) => approval.workflow_step)
  onboarding_approvals: OnboardingApproval[];

  @OneToMany(() => OnboardingTask, (task) => task.workflow_step)
  onboarding_tasks: OnboardingTask[];
}
