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
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveBalanceImportIssueCodeEnum } from '../enums/leave-balance-import-issue-code.enum';
import {
  LeaveBalanceImportResultStatusEnum,
  LeaveBalanceImportValidationStatusEnum,
} from '../enums/leave-balance-import-row-status.enum';
import { LeaveBalanceAdjustment } from './leave-balance-adjustment.entity';
import { LeaveBalanceImportBatch } from './leave-balance-import-batch.entity';
import { LeaveBalance } from './leave-balance.entity';
import { LeaveType } from './leave-type.entity';

export type LeaveBalanceImportRowIssue = {
  code: LeaveBalanceImportIssueCodeEnum;
  severity: 'error' | 'warning' | 'info';
  field: string | null;
  message: string;
};

@Entity('leave_balance_import_rows')
@Index('UQ_leave_balance_import_row_number', ['batch_id', 'row_number'], {
  unique: true,
})
@Index('IDX_leave_balance_import_row_batch_status', [
  'batch_id',
  'validation_status',
])
@Index('IDX_leave_balance_import_row_employee', ['employee_id'])
export class LeaveBalanceImportRow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  batch_id: number;

  /** Worksheet row number, so users can find the row in their file. */
  @Column()
  row_number: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  employee_no: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  employee_name: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  leave_type_code: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  leave_type_name: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  branch_name: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  department_name: string | null;

  /** Server-resolved identifiers; never taken from the workbook. */
  @Column({ type: 'int', nullable: true })
  employee_id: number | null;

  @Column({ type: 'int', nullable: true })
  leave_type_id: number | null;

  @Column({ type: 'int', nullable: true })
  leave_balance_id: number | null;

  @Column({ type: 'int', nullable: true })
  branch_id: number | null;

  @Column({ type: 'int', nullable: true })
  department_id: number | null;

  /** Values as typed in the workbook, kept for the error report. */
  @Column({ type: 'jsonb' })
  raw_data: Record<string, string>;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  uploaded_current_balance: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  db_current_balance: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  new_balance: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  adjustment_days: string | null;

  /** leave_balances.version observed at validation, for concurrency checks. */
  @Column({ type: 'int', nullable: true })
  balance_version: number | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 20 })
  validation_status: LeaveBalanceImportValidationStatusEnum;

  @Column({ type: 'varchar', length: 20, nullable: true })
  result_status: LeaveBalanceImportResultStatusEnum | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  error_code: LeaveBalanceImportIssueCodeEnum | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'jsonb', nullable: true })
  issues: LeaveBalanceImportRowIssue[] | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  previous_balance_at_import: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  new_balance_at_import: string | null;

  @Column({ type: 'int', nullable: true })
  leave_balance_adjustment_id: number | null;

  @Column({ type: 'int', nullable: true })
  leave_balance_transaction_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  processed_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => LeaveBalanceImportBatch, (batch) => batch.rows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'batch_id' })
  batch: LeaveBalanceImportBatch;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee | null;

  @ManyToOne(() => LeaveType, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'leave_type_id' })
  leave_type: LeaveType | null;

  @ManyToOne(() => LeaveBalance, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'leave_balance_id' })
  leave_balance: LeaveBalance | null;

  @ManyToOne(() => LeaveBalanceAdjustment, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'leave_balance_adjustment_id' })
  leave_balance_adjustment: LeaveBalanceAdjustment | null;
}
