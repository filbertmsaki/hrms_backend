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
import { Company } from '../../../companies/entities/company.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveBalanceTransactionTypeEnum } from '../enums/leave-balance-transaction-type.enum';
import { LeaveBalance } from './leave-balance.entity';
import { LeaveRequest } from './leave-request.entity';
import { LeaveType } from './leave-type.entity';

@Entity('leave_balance_transactions')
@Index('IDX_leave_balance_tx_employee_type_year', [
  'employee_id',
  'leave_type_id',
  'leave_year',
])
@Index('IDX_leave_balance_tx_company_effective_date', [
  'company_id',
  'effective_date',
])
@Unique('UQ_leave_balance_transaction_idempotency', [
  'company_id',
  'idempotency_key',
])
export class LeaveBalanceTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column()
  leave_type_id: number;

  @Column({ type: 'int', nullable: true })
  leave_balance_id: number | null;

  @Column({ type: 'int', nullable: true })
  leave_request_id: number | null;

  @Column({ type: 'int', nullable: true })
  accrual_run_id: number | null;

  @Column({ type: 'int', nullable: true })
  recalculation_run_id: number | null;

  @Column({
    type: 'enum',
    enum: LeaveBalanceTransactionTypeEnum,
    enumName: 'leave_balance_transaction_type_enum',
  })
  transaction_type: LeaveBalanceTransactionTypeEnum;

  @Column({ length: 20 })
  leave_year: string;

  @Column({ type: 'date' })
  effective_date: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  previous_balance_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  amount_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  new_balance_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  previous_pending_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  pending_delta_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  new_pending_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  previous_used_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  used_delta_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  new_used_days: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ length: 180 })
  idempotency_key: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  reversed_transaction_id: number | null;

  @Column({ default: false })
  is_reversal: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => LeaveType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_type_id' })
  leave_type: LeaveType;

  @ManyToOne(() => LeaveBalance, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'leave_balance_id' })
  leave_balance: LeaveBalance | null;

  @ManyToOne(() => LeaveRequest, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'leave_request_id' })
  leave_request: LeaveRequest | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  created_by_company_user: CompanyUser | null;

  @ManyToOne(() => LeaveBalanceTransaction, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reversed_transaction_id' })
  reversed_transaction: LeaveBalanceTransaction | null;
}
