import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveType } from './leave-type.entity';

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

  @Column()
  employee_id: number;

  @Column()
  leave_type_id: number;

  @Column({ length: 20 })
  fiscal_year: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  allocated_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  used_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  pending_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  carried_forward_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  expired_days: string;

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
}
