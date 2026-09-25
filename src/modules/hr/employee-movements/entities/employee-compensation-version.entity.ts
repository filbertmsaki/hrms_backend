import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeMovement } from './employee-movement.entity';

export enum EmployeeCompensationVersionStatusEnum {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  CANCELLED = 'CANCELLED',
}

export type SalaryComponentOverride = {
  /** Fixed amount replacing the structure default. */
  amount?: string | null;
  /** Percentage of base salary replacing the structure default rate. */
  rate?: string | null;
  /** Drop this structure line for the employee. */
  excluded?: boolean;
};

@Entity('employee_compensation_versions')
@Index('IDX_employee_compensation_employee_effective', [
  'companyId',
  'employeeId',
  'effectiveFrom',
])
@Index('IDX_employee_compensation_structure_code', [
  'companyId',
  'salaryStructureCode',
])
export class EmployeeCompensationVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'movement_id', type: 'int', nullable: true })
  movementId: number | null;

  @Column({ name: 'base_salary', type: 'decimal', precision: 18, scale: 2 })
  baseSalary: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({
    name: 'salary_structure_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  salaryStructureCode: string | null;

  /**
   * Employee-specific adjustments to the lines of the assigned salary
   * structure, keyed by payroll component code.
   */
  @Column({ name: 'component_overrides', type: 'jsonb', nullable: true })
  componentOverrides: Record<string, SalaryComponentOverride> | null;

  @Column({
    name: 'pay_frequency',
    type: 'varchar',
    length: 30,
    default: 'MONTHLY',
  })
  payFrequency: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: EmployeeCompensationVersionStatusEnum.ACTIVE,
  })
  status: EmployeeCompensationVersionStatusEnum;

  @Column({
    name: 'revision_reference',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  revisionReference: string | null;

  @Column({ type: 'text', nullable: true })
  justification: string | null;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({
    name: 'payroll_sync_status',
    type: 'varchar',
    length: 40,
    default: 'PENDING_PAYROLL_INTEGRATION',
  })
  payrollSyncStatus: string;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => EmployeeMovement, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'movement_id' })
  movement: EmployeeMovement | null;
}
