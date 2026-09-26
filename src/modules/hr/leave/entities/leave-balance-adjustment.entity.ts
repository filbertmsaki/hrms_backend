import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveBalanceAdjustmentSourceEnum } from '../enums/leave-balance-adjustment-source.enum';
import { LeaveBalanceImportBatch } from './leave-balance-import-batch.entity';
import { LeaveBalanceImportRow } from './leave-balance-import-row.entity';
import { LeaveBalanceTransaction } from './leave-balance-transaction.entity';
import { LeaveBalance } from './leave-balance.entity';
import { LeaveType } from './leave-type.entity';

@Entity('leave_balance_adjustments')
@Index('IDX_leave_balance_adjustment_company', ['company_id'])
@Index('IDX_leave_balance_adjustment_employee', ['employee_id'])
@Index('IDX_leave_balance_adjustment_leave_type', ['leave_type_id'])
@Index('IDX_leave_balance_adjustment_fiscal_year', ['fiscal_year'])
@Index('IDX_leave_balance_adjustment_leave_balance', ['leave_balance_id'])
@Index('IDX_leave_balance_adjustment_import_batch', ['import_batch_id'])
export class LeaveBalanceAdjustment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  leave_balance_id: number;

  @Column()
  employee_id: number;

  @Column()
  leave_type_id: number;

  @Column({ length: 20 })
  fiscal_year: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  old_balance_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  new_balance_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  adjustment_amount_days: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: LeaveBalanceAdjustmentSourceEnum,
    default: LeaveBalanceAdjustmentSourceEnum.MANUAL,
  })
  source: LeaveBalanceAdjustmentSourceEnum;

  @Column({ type: 'int', nullable: true })
  adjusted_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  leave_balance_transaction_id: number | null;

  @Column({ type: 'int', nullable: true })
  import_batch_id: number | null;

  @Column({ type: 'int', nullable: true })
  import_row_id: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference: string | null;

  @CreateDateColumn()
  adjusted_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => LeaveBalance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_balance_id' })
  leave_balance: LeaveBalance;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => LeaveType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_type_id' })
  leave_type: LeaveType;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'adjusted_by_company_user_id' })
  adjusted_by_company_user: CompanyUser | null;

  @ManyToOne(() => LeaveBalanceTransaction, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'leave_balance_transaction_id' })
  leave_balance_transaction: LeaveBalanceTransaction | null;

  @ManyToOne(() => LeaveBalanceImportBatch, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'import_batch_id' })
  import_batch: LeaveBalanceImportBatch | null;

  @ManyToOne(() => LeaveBalanceImportRow, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'import_row_id' })
  import_row: LeaveBalanceImportRow | null;
}
