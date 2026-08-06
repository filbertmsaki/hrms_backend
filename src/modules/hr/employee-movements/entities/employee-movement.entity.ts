import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeMovementTypeEnum } from '../enums/employee-movement-type.enum';
import { EmployeeMovementStatusEnum } from '../enums/employee-movement-status.enum';
import { EmployeeMovementChange } from './employee-movement-change.entity';

@Entity('employee_movements')
@Unique('UQ_employee_movement_company_no', ['companyId', 'movementNo'])
@Index('IDX_employee_movement_company_status', ['companyId', 'status'])
@Index('IDX_employee_movement_employee', ['companyId', 'employeeId'])
@Index('IDX_employee_movement_effective_date', ['effectiveDate', 'status'])
export class EmployeeMovement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'movement_no', type: 'varchar', length: 60 })
  movementNo: string;

  @Column({ name: 'movement_type', type: 'varchar', length: 40 })
  movementType: EmployeeMovementTypeEnum;

  @Column({
    type: 'varchar',
    length: 40,
    default: EmployeeMovementStatusEnum.DRAFT,
  })
  status: EmployeeMovementStatusEnum;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @Column({ name: 'requested_by_company_user_id', type: 'int', nullable: true })
  requestedByCompanyUserId: number | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'current_snapshot', type: 'jsonb' })
  currentSnapshot: Record<string, unknown>;

  @Column({ name: 'proposed_snapshot', type: 'jsonb' })
  proposedSnapshot: Record<string, unknown>;

  @Column({ name: 'employee_version_at_creation', type: 'int', nullable: true })
  employeeVersionAtCreation: number | null;

  @Column({ name: 'snapshot_hash', type: 'varchar', length: 128 })
  snapshotHash: string;

  @Column({ name: 'application_attempt_count', type: 'int', default: 0 })
  applicationAttemptCount: number;

  @Column({ name: 'application_failed_at', type: 'timestamptz', nullable: true })
  applicationFailedAt: Date | null;

  @Column({ name: 'application_error', type: 'text', nullable: true })
  applicationError: string | null;

  @Column({ name: 'application_snapshot', type: 'jsonb', nullable: true })
  applicationSnapshot: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({
    name: 'employee_acknowledgement_required',
    type: 'boolean',
    default: false,
  })
  employeeAcknowledgementRequired: boolean;

  @Column({
    name: 'employee_acknowledged_at',
    type: 'timestamptz',
    nullable: true,
  })
  employeeAcknowledgedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requested_by_company_user_id' })
  requestedBy: CompanyUser | null;

  @OneToMany(() => EmployeeMovementChange, (change) => change.movement, {
    cascade: true,
  })
  changes: EmployeeMovementChange[];
}
