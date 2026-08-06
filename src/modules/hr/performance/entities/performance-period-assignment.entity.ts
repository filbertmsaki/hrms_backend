import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeePerformancePlan } from './employee-performance-plan.entity';
import { PerformancePeriodAssignmentStatusEnum } from '../enums/performance-period-assignment-status.enum';
import { PerformancePeriod } from './performance-period.entity';

@Entity('performance_period_assignments')
@Unique('UQ_performance_period_assignment_employee', [
  'performancePeriodId',
  'employeeId',
])
@Index('IDX_performance_period_assignment_company_status', [
  'companyId',
  'status',
])
export class PerformancePeriodAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_period_id', type: 'int' })
  performancePeriodId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'performance_plan_id', type: 'int' })
  performancePlanId: number;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({
    name: 'manager_company_user_id',
    type: 'int',
    nullable: true,
  })
  managerCompanyUserId: number | null;

  @Column({
    type: 'enum',
    enum: PerformancePeriodAssignmentStatusEnum,
    default: PerformancePeriodAssignmentStatusEnum.OPEN,
  })
  status: PerformancePeriodAssignmentStatusEnum;

  @Column({ name: 'employee_snapshot', type: 'jsonb' })
  employeeSnapshot: Record<string, unknown>;

  @Column({ name: 'plan_snapshot', type: 'jsonb' })
  planSnapshot: Record<string, unknown>;

  @Column({ name: 'total_weight', type: 'decimal', precision: 7, scale: 2 })
  totalWeight: string;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => PerformancePeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'performance_period_id' })
  performancePeriod: PerformancePeriod;

  @ManyToOne(() => EmployeePerformancePlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'performance_plan_id' })
  performancePlan: EmployeePerformancePlan;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;
}
