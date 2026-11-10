import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { LeavePolicy } from './leave-policy.entity';
import { LeaveType } from './leave-type.entity';
import { LeaveAccrualMethodEnum } from '../enums/leave-accrual-method.enum';

@Entity('leave_policy_types')
@Unique('UQ_leave_policy_type_policy_leave_type', [
  'policy_id',
  'leave_type_id',
])
@Index('IDX_leave_policy_type_policy', ['policy_id'])
@Index('IDX_leave_policy_type_leave_type', ['leave_type_id'])
export class LeavePolicyType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  policy_id: number;

  @Column()
  leave_type_id: number;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  annual_quota_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  max_per_request_days: string | null;

  @Column({ default: true })
  requires_approval: boolean;

  @Column({ default: false })
  encashment_enabled: boolean;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  maximum_encashment_days: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  encashment_rate_divisor: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  minimum_balance_after_encashment: string;

  @Column({ default: true })
  encashment_requires_approval: boolean;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  maximum_accumulation_days: string | null;

  /**
   * Accrual for this leave type; null = the policy's accrual method. Lets
   * annual leave accrue daily pro-rata while other types stay yearly.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  accrual_method: LeaveAccrualMethodEnum | null;

  /**
   * Carry-forward policy for employees covered by this policy. null = use the
   * leave type's basic carry-forward settings (no expiry).
   */
  @Column({ type: 'boolean', nullable: true })
  carry_forward_enabled: boolean | null;

  /** Maximum days carried into the next leave year; null = no cap. */
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  carry_forward_max_days: string | null;

  /** Carried days expire this many months into the new leave year. */
  @Column({ type: 'int', nullable: true })
  carry_forward_expiry_months: number | null;

  /** Or on this fixed date (MM-DD) of the new leave year. */
  @Column({ type: 'varchar', length: 5, nullable: true })
  carry_forward_expiry_date: string | null;

  /** Unused carried days expire automatically on the expiry date. */
  @Column({ default: true })
  carry_forward_auto_expire: boolean;

  /** Leave taken uses carried-forward days before newly accrued days. */
  @Column({ default: true })
  carry_forward_consume_first: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => LeavePolicy, (policy) => policy.leave_types, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'policy_id' })
  policy: LeavePolicy;

  @ManyToOne(() => LeaveType, (leaveType) => leaveType.policy_types, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'leave_type_id' })
  leave_type: LeaveType;
}
