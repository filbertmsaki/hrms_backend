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
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { LeaveBalanceImportBatchStatusEnum } from '../enums/leave-balance-import-batch-status.enum';
import { LeaveBalanceImportModeEnum } from '../enums/leave-balance-import-mode.enum';
import { LeaveBalanceImportRow } from './leave-balance-import-row.entity';

@Entity('leave_balance_import_batches')
@Index('UQ_leave_balance_import_batch_ref', ['batch_ref'], { unique: true })
@Index('IDX_leave_balance_import_batch_company_created', [
  'company_id',
  'created_at',
])
@Index('IDX_leave_balance_import_batch_status', ['status'])
export class LeaveBalanceImportBatch {
  @PrimaryGeneratedColumn()
  id: number;

  /** Human-readable Import Batch ID shown to users, e.g. LBI-20260926-3F9A1C. */
  @Column({ type: 'varchar', length: 40 })
  batch_ref: string;

  @Column()
  company_id: number;

  @Column({ type: 'varchar', length: 20 })
  fiscal_year: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  template_id: string | null;

  @Column({ type: 'varchar', length: 20 })
  template_version: string;

  @Column({ type: 'timestamptz', nullable: true })
  template_generated_at: Date | null;

  @Column({ type: 'varchar', length: 30 })
  status: LeaveBalanceImportBatchStatusEnum;

  @Column({ type: 'varchar', length: 30, nullable: true })
  import_mode: LeaveBalanceImportModeEnum | null;

  @Column({ type: 'varchar', length: 255 })
  original_file_name: string;

  @Column({ type: 'int', default: 0 })
  file_size: number;

  @Column({ type: 'varchar', length: 128 })
  file_checksum: string;

  @Column({ type: 'text', nullable: true })
  default_reason: string | null;

  @Column({ type: 'int', default: 0 })
  total_rows: number;

  @Column({ type: 'int', default: 0 })
  valid_rows: number;

  @Column({ type: 'int', default: 0 })
  warning_rows: number;

  @Column({ type: 'int', default: 0 })
  invalid_rows: number;

  @Column({ type: 'int', default: 0 })
  no_change_rows: number;

  @Column({ type: 'int', default: 0 })
  imported_rows: number;

  @Column({ type: 'int', default: 0 })
  skipped_rows: number;

  @Column({ type: 'int', default: 0 })
  failed_rows: number;

  /** Changed rows applied so far while the batch is PROCESSING (progress). */
  @Column({ type: 'int', default: 0 })
  processed_rows: number;

  @Column({ type: 'int', default: 0 })
  total_employees: number;

  @Column({ type: 'int', default: 0 })
  employees_affected: number;

  @Column({ type: 'jsonb', nullable: true })
  summary: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  failure_reason: string | null;

  /**
   * Snapshot of the confirming user (scope and permissions) so the background
   * job validates and audits the import as that user.
   */
  @Column({ type: 'jsonb', nullable: true })
  processing_context: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  uploaded_by_company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  confirmed_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmed_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'int', nullable: true })
  cancelled_by_company_user_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelled_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_company_user_id' })
  uploaded_by_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'confirmed_by_company_user_id' })
  confirmed_by_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cancelled_by_company_user_id' })
  cancelled_by_company_user: CompanyUser | null;

  @OneToMany(() => LeaveBalanceImportRow, (row) => row.batch)
  rows: LeaveBalanceImportRow[];
}
