import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { LeaveApprovalActionEnum } from '../enums/leave-approval-action.enum';
import { LeaveApprovalStatusEnum } from '../enums/leave-approval-status.enum';
import { LeaveApprovalWorkflowStep } from './leave-approval-workflow-step.entity';
import { LeaveRequest } from './leave-request.entity';

@Entity('leave_request_approvals')
@Index('IDX_leave_request_approval_leave_request', ['leave_request_id'])
@Index('IDX_leave_request_approval_status', ['status'])
@Index('IDX_leave_request_approval_actor', ['approver_company_user_id'])
export class LeaveRequestApproval {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  leave_request_id: number;

  @Column({ type: 'int', nullable: true })
  workflow_step_id: number | null;

  @Column({ type: 'int' })
  approval_level: number;

  @Column({ type: 'int', default: 1 })
  approval_cycle: number;

  @Column({ type: 'int', nullable: true })
  approver_company_user_id: number | null;

  @Column({
    type: 'enum',
    enum: LeaveApprovalStatusEnum,
    default: LeaveApprovalStatusEnum.PENDING,
  })
  status: LeaveApprovalStatusEnum;

  @Column({ type: 'varchar', length: 30, nullable: true })
  action: LeaveApprovalActionEnum | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ type: 'text', nullable: true })
  signature_url: string | null;

  @Column({ type: 'timestamp', nullable: true })
  acted_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => LeaveRequest, (leaveRequest) => leaveRequest.approvals, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'leave_request_id' })
  leave_request: LeaveRequest;

  @ManyToOne(() => LeaveApprovalWorkflowStep, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'workflow_step_id' })
  workflow_step: LeaveApprovalWorkflowStep | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approver_company_user_id' })
  approver: CompanyUser | null;
}
