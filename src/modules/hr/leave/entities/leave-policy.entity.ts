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
import { Department } from '../../departments/entities/department.entity';
import { Position } from '../../positions/entities/position.entity';
import { LeaveAccrualMethodEnum } from '../enums/leave-accrual-method.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeavePolicyType } from './leave-policy-type.entity';

@Entity('leave_policies')
@Index('IDX_leave_policy_company', ['company_id'])
@Index('IDX_leave_policy_department', ['applicable_department_id'])
@Index('IDX_leave_policy_position', ['applicable_position_id'])
export class LeavePolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: true })
  applicable_department_id: number | null;

  @Column({ type: 'int', nullable: true })
  applicable_position_id: number | null;

  @Column({
    type: 'enum',
    enum: LeaveAccrualMethodEnum,
    default: LeaveAccrualMethodEnum.YEARLY,
  })
  accrual_method: LeaveAccrualMethodEnum;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  accrual_rate: string | null;

  @Column({ type: 'int', nullable: true })
  max_consecutive_days: number | null;

  @Column({ type: 'int', default: 0 })
  min_service_months: number;

  @Column({ default: false })
  allow_negative_balance: boolean;

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

  @ManyToOne(() => Department, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applicable_department_id' })
  applicable_department: Department | null;

  @ManyToOne(() => Position, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applicable_position_id' })
  applicable_position: Position | null;

  @OneToMany(() => LeavePolicyType, (policyType) => policyType.policy, {
    cascade: true,
  })
  leave_types: LeavePolicyType[];
}
