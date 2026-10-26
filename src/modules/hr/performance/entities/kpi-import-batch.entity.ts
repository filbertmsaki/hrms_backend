import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type KpiImportRow = {
  rowNumber: number;
  sourceRecordId: string;
  employeeNo: string;
  kpiCode: string;
  periodId: number;
  measurementUnit: string;
  value: string;
  achievementId: number | null;
  errors: string[];
};

export enum KpiImportBatchStatus {
  VALIDATED = 'VALIDATED',
  REJECTED = 'REJECTED',
  APPROVED = 'APPROVED',
  APPLIED = 'APPLIED',
}

@Entity('kpi_import_batches')
@Index('IDX_kpi_import_batch_company_created', ['companyId', 'createdAt'])
@Index('UQ_kpi_import_batch_company_checksum', ['companyId', 'checksum'], {
  unique: true,
})
export class KpiImportBatch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ type: 'varchar', length: 64 })
  checksum: string;

  @Column({ type: 'varchar', length: 20 })
  status: KpiImportBatchStatus;

  @Column({ name: 'row_count', type: 'int' })
  rowCount: number;

  @Column({ name: 'valid_row_count', type: 'int' })
  validRowCount: number;

  @Column({ type: 'jsonb' })
  rows: KpiImportRow[];

  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
