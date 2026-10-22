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
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveType } from './leave-type.entity';
import { LeaveBalanceAdjustment } from './leave-balance-adjustment.entity';

@Entity('leave_balances')
@Unique('UQ_leave_balance_employee_type_year', [
  'employee_id',
  'leave_type_id',
  'fiscal_year',
])
@Index('IDX_leave_balance_employee', ['employee_id'])
@Index('IDX_leave_balance_leave_type', ['leave_type_id'])
@Index('IDX_leave_balance_fiscal_year', ['fiscal_year'])
export class LeaveBalance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  company_id: number | null;

  @Column()
  employee_id: number;

  @Column()
  leave_type_id: number;

  @Column({ type: 'int', nullable: true })
  policy_id: number | null;

  @Column({ type: 'int', nullable: true })
  policy_type_id: number | null;

  @Column({ length: 20 })
  fiscal_year: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  allocated_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  opening_balance_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  entitlement_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  accrued_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  used_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  pending_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  approved_future_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  carried_forward_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  expired_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  adjusted_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  attendance_deduction_days: string;

  @Column({ type: 'timestamp', nullable: true })
  generated_at: Date | null;

  @Column({ type: 'date', nullable: true })
  leave_year_start_date: string | null;

  @Column({ type: 'date', nullable: true })
  leave_year_end_date: string | null;

  @Column({ type: 'int', nullable: true })
  last_transaction_id: number | null;

  @Column({ default: 1 })
  version: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => LeaveType, (leaveType) => leaveType.balances, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'leave_type_id' })
  leave_type: LeaveType;

  @OneToMany(
    () => LeaveBalanceAdjustment,
    (adjustment) => adjustment.leave_balance,
  )
  adjustments: LeaveBalanceAdjustment[];
}
