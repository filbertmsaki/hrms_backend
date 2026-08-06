import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { PerformanceFinancialYear } from './performance-financial-year.entity';
import { PerformancePlanStatusEnum } from '../enums/performance-plan-status.enum';
import { EmployeePerformancePlanItem } from './employee-performance-plan-item.entity';

@Entity('employee_performance_plans')
@Unique('UQ_employee_performance_plan_year', [
  'companyId',
  'employeeId',
  'financialYearId',
  'versionNumber',
])
export class EmployeePerformancePlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'financial_year_id', type: 'int' })
  financialYearId: number;

  @Column({ name: 'template_id', type: 'int', nullable: true })
  templateId: number | null;

  @Column({ name: 'version_number', type: 'int', default: 1 })
  versionNumber: number;

  @Column({
    type: 'enum',
    enum: PerformancePlanStatusEnum,
    default: PerformancePlanStatusEnum.DRAFT,
  })
  status: PerformancePlanStatusEnum;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({
    name: 'manager_company_user_id',
    type: 'int',
    nullable: true,
  })
  managerCompanyUserId: number | null;

  @Column({ name: 'employee_snapshot', type: 'jsonb' })
  employeeSnapshot: Record<string, unknown>;

  @Column({ name: 'assignment_snapshot_hash', type: 'varchar', length: 128 })
  assignmentSnapshotHash: string;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  @Column({
    name: 'assigned_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  assignedByCompanyUserId: number | null;

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

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => PerformanceFinancialYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'financial_year_id' })
  financialYear: PerformanceFinancialYear;

  @OneToMany(() => EmployeePerformancePlanItem, (item) => item.plan, {
    cascade: true,
  })
  items: EmployeePerformancePlanItem[];
}
