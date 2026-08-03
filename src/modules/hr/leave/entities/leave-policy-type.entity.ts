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

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  minimum_balance_after_encashment: string;

  @Column({ default: true })
  encashment_requires_approval: boolean;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  maximum_accumulation_days: string | null;

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
