import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveApprovalWorkflowStep } from './leave-approval-workflow-step.entity';
import { LeaveType } from './leave-type.entity';

@Entity('leave_approval_workflows')
@Index('IDX_leave_workflow_company', ['company_id'])
@Index('IDX_leave_workflow_leave_type', ['leave_type_id'])
export class LeaveApprovalWorkflow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'int', nullable: true })
  leave_type_id: number | null;

  @Column({ default: false })
  is_default: boolean;

  @Column({
    type: 'enum',
    enum: LeaveRecordStatusEnum,
    default: LeaveRecordStatusEnum.ACTIVE,
  })
  status: LeaveRecordStatusEnum;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => LeaveType, (leaveType) => leaveType.workflows, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'leave_type_id' })
  leave_type: LeaveType | null;

  @OneToMany(
    () => LeaveApprovalWorkflowStep,
    (leaveApprovalWorkflowStep) => leaveApprovalWorkflowStep.workflow,
    { cascade: true },
  )
  steps: LeaveApprovalWorkflowStep[];
}
