import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import type { ReconciliationRight } from '../../service/reconciliation-rights-planner';

@Entity('access_reconciliation_managed_rights')
@Unique('UQ_access_reconciliation_owner', [
  'companyId',
  'employeeId',
  'deviceId',
])
export class AccessReconciliationManagedRights {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'employee_id', type: 'int' }) employeeId: number;
  @Column({ name: 'device_id', type: 'int' }) deviceId: number;
  @Column({ name: 'device_employee_no', type: 'varchar', length: 100 })
  deviceEmployeeNo: string;
  @Column({
    name: 'managed_rights',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  managedRights: ReconciliationRight[];
  @Column({
    name: 'desired_version',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  desiredVersion: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;
  @Column({ name: 'pending_before', type: 'jsonb', nullable: true })
  pendingBefore: ReconciliationRight[] | null;
  @Column({ name: 'pending_after', type: 'jsonb', nullable: true })
  pendingAfter: ReconciliationRight[] | null;
  @Column({ name: 'pending_managed', type: 'jsonb', nullable: true })
  pendingManaged: ReconciliationRight[] | null;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
