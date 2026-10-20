import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveBalance } from './leave-balance.entity';
import { LeaveBalanceTransaction } from './leave-balance-transaction.entity';
import { LeaveType } from './leave-type.entity';

@Entity('leave_encashment_requests')
@Index('IDX_leave_encashment_company_status', ['company_id', 'status'])
@Index('IDX_leave_encashment_employee_year', [
  'employee_id',
  'leave_type_id',
  'fiscal_year',
])
export class LeaveEncashmentRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column()
  leave_type_id: number;

  @Column()
  leave_balance_id: number;

  @Column({ length: 20 })
  fiscal_year: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  requested_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  approved_days: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  minimum_balance_after_encashment: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';

  @Column({ type: 'text', nullable: true })
  reviewer_comments: string | null;

  @Column({ type: 'int', nullable: true })
  reviewed_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true, unique: true })
  ledger_transaction_id: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  payroll_handoff_reference: string | null;

  @Column({ type: 'timestamp', nullable: true })
  payroll_handed_off_at: Date | null;

  @Column({ type: 'int', nullable: true })
  payroll_handed_off_by_company_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => LeaveType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_type_id' })
  leave_type: LeaveType;

  @ManyToOne(() => LeaveBalance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_balance_id' })
  leave_balance: LeaveBalance;

  @ManyToOne(() => LeaveBalanceTransaction, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ledger_transaction_id' })
  ledger_transaction: LeaveBalanceTransaction | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_company_user_id' })
  reviewer: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  created_by: CompanyUser | null;
}
