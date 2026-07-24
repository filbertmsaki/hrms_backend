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
import { Company } from '../../../../companies/entities/company.entity';
import { CompanyUser } from '../../../../companies/entities/company-user.entity';
import { EmployeeImportModeEnum } from '../enums/employee-import-mode.enum';
import { EmployeeImportBatchStatusEnum } from '../enums/employee-import-batch-status.enum';
import { EmployeeImportRow } from './employee-import-row.entity';

@Entity('employee_import_batches')
@Index('IDX_employee_import_batches_company', ['companyId'])
@Index('IDX_employee_import_batches_batch_id', ['batchId'], { unique: true })
@Index('IDX_employee_import_batches_preview_token', ['previewToken'], {
  unique: true,
})
@Index('IDX_employee_import_batches_status', ['status'])
export class EmployeeImportBatch {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'batch_id', type: 'varchar', length: 40 })
  batchId: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'preview_token', type: 'varchar', length: 120 })
  previewToken: string;

  @Column({
    name: 'import_mode',
    type: 'enum',
    enum: EmployeeImportModeEnum,
    default: EmployeeImportModeEnum.CREATE_ONLY,
  })
  importMode: EmployeeImportModeEnum;

  @Column({
    name: 'status',
    type: 'enum',
    enum: EmployeeImportBatchStatusEnum,
    default: EmployeeImportBatchStatusEnum.PREVIEW_READY,
  })
  status: EmployeeImportBatchStatusEnum;

  @Column({ name: 'original_file_name', type: 'varchar', length: 255 })
  originalFileName: string;

  @Column({ name: 'file_size', type: 'bigint', default: 0 })
  fileSize: string;

  @Column({ name: 'file_checksum', type: 'varchar', length: 128 })
  fileChecksum: string;

  @Column({ name: 'uploaded_by_company_user_id', type: 'int', nullable: true })
  uploadedByCompanyUserId: number | null;

  @Column({ name: 'preview_expires_at', type: 'timestamp', nullable: true })
  previewExpiresAt: Date | null;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows: number;

  @Column({ name: 'valid_rows', type: 'int', default: 0 })
  validRows: number;

  @Column({ name: 'invalid_rows', type: 'int', default: 0 })
  invalidRows: number;

  @Column({ name: 'duplicate_rows', type: 'int', default: 0 })
  duplicateRows: number;

  @Column({ name: 'successful_rows', type: 'int', default: 0 })
  successfulRows: number;

  @Column({ name: 'failed_rows', type: 'int', default: 0 })
  failedRows: number;

  @Column({ name: 'warning_rows', type: 'int', default: 0 })
  warningRows: number;

  @Column({ name: 'created_employees', type: 'int', default: 0 })
  createdEmployees: number;

  @Column({ name: 'updated_employees', type: 'int', default: 0 })
  updatedEmployees: number;

  @Column({ name: 'created_users', type: 'int', default: 0 })
  createdUsers: number;

  @Column({ name: 'device_assignments_created', type: 'int', default: 0 })
  deviceAssignmentsCreated: number;

  @Column({ name: 'device_sync_pending', type: 'int', default: 0 })
  deviceSyncPending: number;

  @Column({ name: 'validation_summary', type: 'json', nullable: true })
  validationSummary: Record<string, unknown> | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_company_user_id' })
  uploadedByCompanyUser: CompanyUser | null;

  @OneToMany(() => EmployeeImportRow, (row) => row.batch, {
    cascade: true,
  })
  rows: EmployeeImportRow[];
}
