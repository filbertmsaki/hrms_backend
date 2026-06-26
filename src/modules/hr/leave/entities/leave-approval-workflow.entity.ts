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
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveApprovalWorkflowStep } from './leave-approval-workflow-step.entity';
import { LeaveType } from './leave-type.entity';

@Entity('leave_approval_workflows')
@Index('IDX_leave_workflow_company', ['company_id'])
@Index('IDX_leave_workflow_leave_type', ['leave_type_id'])
// Prevents duplicate workflows for the same leave type per company.
// MariaDB allows multiple NULLs in unique indexes, so workflows without a
// leave_type_id (default workflows) don't conflict with each other here;
// the default_guard_key generated column below enforces one-default-per-company.
@Unique('UQ_leave_workflow_company_type', ['company_id', 'leave_type_id'])
// Enforces at most one is_default=true workflow per company.
// Generated column emits company_id when is_default is true, NULL otherwise.
// MySQL/MariaDB unique indexes treat each NULL as distinct, so non-defaults never
// conflict while two defaults for the same company produce a duplicate-key error.
@Index('UQ_leave_workflow_default_per_company', ['default_guard_key'], {
  unique: true,
})
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

  // Generated guard: equals company_id when is_default=true, NULL otherwise.
  // Used by UQ_leave_workflow_default_per_company to allow only one default per company.
  @Column({
    name: 'default_guard_key',
    type: 'int',
    asExpression: 'IF(`is_default`, `company_id`, NULL)',
    generatedType: 'STORED',
    select: false,
    insert: false,
    update: false,
    nullable: true,
  })
  default_guard_key: number | null;

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
