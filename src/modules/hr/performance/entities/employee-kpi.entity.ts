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
  VersionColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import {
  EmployeeKpiMeasurementTypeEnum,
  EmployeeKpiProgressSourceEnum,
  EmployeeKpiReviewDecisionEnum,
  EmployeeKpiStatusEnum,
} from '../enums/employee-kpi-status.enum';
import { PerformancePeriod } from './performance-period.entity';

@Entity('employee_kpis')
@Index('IDX_employee_kpi_company_period_employee', [
  'companyId',
  'performancePeriodId',
  'employeeId',
])
@Index('IDX_employee_kpi_company_status_reviewer', [
  'companyId',
  'status',
  'reviewerEmployeeId',
])
@Index('IDX_employee_kpi_due_date', ['dueDate'])
export class EmployeeKpi {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_period_id', type: 'int' })
  performancePeriodId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ type: 'varchar', length: 250 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    name: 'measurement_type',
    type: 'enum',
    enum: EmployeeKpiMeasurementTypeEnum,
    enumName: 'employee_kpi_measurement_type_enum',
  })
  measurementType: EmployeeKpiMeasurementTypeEnum;

  @Column({
    name: 'target_value',
    type: 'decimal',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  targetValue: string | null;

  @Column({
    name: 'actual_value',
    type: 'decimal',
    precision: 18,
    scale: 4,
    nullable: true,
  })
  actualValue: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  unit: string | null;

  @Column({ type: 'decimal', precision: 7, scale: 2 })
  weight: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({
    name: 'progress_source',
    type: 'enum',
    enum: EmployeeKpiProgressSourceEnum,
    enumName: 'employee_kpi_progress_source_enum',
    default: EmployeeKpiProgressSourceEnum.MANUAL,
  })
  progressSource: EmployeeKpiProgressSourceEnum;

  @Column({
    type: 'enum',
    enum: EmployeeKpiStatusEnum,
    enumName: 'employee_kpi_status_enum',
    default: EmployeeKpiStatusEnum.DRAFT,
  })
  status: EmployeeKpiStatusEnum;

  @Column({ name: 'reviewer_employee_id', type: 'int', nullable: true })
  reviewerEmployeeId: number | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'reviewed_by_company_user_id', type: 'int', nullable: true })
  reviewedByCompanyUserId: number | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment: string | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => PerformancePeriod, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'performance_period_id' })
  performancePeriod: PerformancePeriod;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewer_employee_id' })
  reviewer: Employee | null;

  @OneToMany(() => EmployeeKpiReviewHistory, (history) => history.employeeKpi)
  reviewHistory: EmployeeKpiReviewHistory[];
}

@Entity('employee_kpi_review_history')
@Index('IDX_employee_kpi_review_history_kpi_created', [
  'employeeKpiId',
  'createdAt',
])
export class EmployeeKpiReviewHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_kpi_id', type: 'int' })
  employeeKpiId: number;

  @Column({ name: 'actor_company_user_id', type: 'int', nullable: true })
  actorCompanyUserId: number | null;

  @Column({ name: 'actor_employee_id', type: 'int', nullable: true })
  actorEmployeeId: number | null;

  @Column({ name: 'from_status', type: 'varchar', length: 40, nullable: true })
  fromStatus: EmployeeKpiStatusEnum | null;

  @Column({ name: 'to_status', type: 'varchar', length: 40 })
  toStatus: EmployeeKpiStatusEnum;

  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  decision: EmployeeKpiReviewDecisionEnum | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ name: 'snapshot', type: 'jsonb', nullable: true })
  snapshot: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => EmployeeKpi, (kpi) => kpi.reviewHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_kpi_id' })
  employeeKpi: EmployeeKpi;
}
