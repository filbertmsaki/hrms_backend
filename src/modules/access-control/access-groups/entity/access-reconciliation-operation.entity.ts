import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('access_reconciliation_operations')
@Index('IDX_access_reconciliation_company_status', ['companyId', 'status'])
@Index('IDX_access_reconciliation_employee_device', [
  'companyId',
  'employeeId',
  'deviceId',
])
export class AccessReconciliationOperation {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'employee_id', type: 'int' }) employeeId: number;
  @Column({ name: 'device_id', type: 'int' }) deviceId: number;
  @Column({ name: 'source_group_id', type: 'int' }) sourceGroupId: number;
  @Column({ name: 'requested_by_company_user_id', type: 'int', nullable: true })
  requestedByCompanyUserId: number | null;
  @Column({ name: 'reason', type: 'varchar', length: 32 }) reason: string;
  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    default: 'PENDING_REVIEW',
  })
  status: string;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError:
    | string
    | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
