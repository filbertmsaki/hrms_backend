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
import { LeaveGenderRestrictionEnum } from '../enums/leave-gender-restriction.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveApprovalWorkflow } from './leave-approval-workflow.entity';
import { LeaveBalance } from './leave-balance.entity';
import { LeavePolicyType } from './leave-policy-type.entity';
import { LeaveRequest } from './leave-request.entity';

@Entity('leave_types')
@Unique('UQ_leave_type_company_code', ['company_id', 'code'])
@Index('IDX_leave_type_company', ['company_id'])
export class LeaveType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 50 })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: true })
  is_paid: boolean;

  @Column({ default: false })
  requires_attachment: boolean;

  @Column({ default: false })
  is_carry_forward_allowed: boolean;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  max_carry_forward_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  max_days_per_year: string;

  @Column({
    type: 'enum',
    enum: LeaveGenderRestrictionEnum,
    default: LeaveGenderRestrictionEnum.ANY,
  })
  gender_restriction: LeaveGenderRestrictionEnum;

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

  @OneToMany(() => LeavePolicyType, (policyType) => policyType.leave_type)
  policy_types: LeavePolicyType[];

  @OneToMany(() => LeaveRequest, (leaveRequest) => leaveRequest.leave_type)
  leave_requests: LeaveRequest[];

  @OneToMany(
    () => LeaveApprovalWorkflow,
    (leaveApprovalWorkflow) => leaveApprovalWorkflow.leave_type,
  )
  workflows: LeaveApprovalWorkflow[];

  @OneToMany(() => LeaveBalance, (leaveBalance) => leaveBalance.leave_type)
  balances: LeaveBalance[];
}
