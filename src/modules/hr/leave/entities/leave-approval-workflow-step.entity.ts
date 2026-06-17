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
import { LeaveApprovalActionTypeEnum } from '../enums/leave-approval-action-type.enum';
import { LeaveApproverTypeEnum } from '../enums/leave-approver-type.enum';
import { LeaveApprovalWorkflow } from './leave-approval-workflow.entity';
import { LeaveRequestApproval } from './leave-request-approval.entity';

@Entity('leave_approval_workflow_steps')
@Unique('UQ_leave_workflow_step_workflow_level', [
  'workflow_id',
  'approval_level',
])
@Index('IDX_leave_workflow_step_workflow', ['workflow_id'])
@Index('IDX_leave_workflow_step_role', ['role_id'])
@Index('IDX_leave_workflow_step_position', ['position_id'])
@Index('IDX_leave_workflow_step_company_user', ['company_user_id'])
@Index('IDX_leave_workflow_step_branch', ['assigned_branch_id'])
@Index('IDX_leave_workflow_step_department', ['assigned_department_id'])
export class LeaveApprovalWorkflowStep {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  workflow_id: number;

  @Column({ type: 'int' })
  approval_level: number;

  @Column({
    type: 'enum',
    enum: LeaveApproverTypeEnum,
  })
  approver_type: LeaveApproverTypeEnum;

  @Column({ type: 'int', nullable: true })
  assigned_branch_id: number | null;

  @Column({ type: 'int', nullable: true })
  assigned_department_id: number | null;

  @Column({ type: 'int', nullable: true })
  role_id: number | null;

  @Column({ type: 'int', nullable: true })
  position_id: number | null;

  @Column({ type: 'int', nullable: true })
  company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: LeaveApprovalActionTypeEnum,
  })
  action_type: LeaveApprovalActionTypeEnum;

  @Column({ default: true })
  is_required: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(
    () => LeaveApprovalWorkflow,
    (leaveApprovalWorkflow) => leaveApprovalWorkflow.steps,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'workflow_id' })
  workflow: LeaveApprovalWorkflow;

  @ManyToOne(() => Role, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'role_id' })
  role: Role | null;

  @ManyToOne(() => Branch, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_branch_id' })
  assigned_branch: Branch | null;

  @ManyToOne(() => Department, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_department_id' })
  assigned_department: Department | null;

  @ManyToOne(() => Position, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'position_id' })
  position: Position | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'company_user_id' })
  company_user: CompanyUser | null;

  @OneToMany(
    () => LeaveRequestApproval,
    (leaveRequestApproval) => leaveRequestApproval.workflow_step,
  )
  leave_request_approvals: LeaveRequestApproval[];
}
