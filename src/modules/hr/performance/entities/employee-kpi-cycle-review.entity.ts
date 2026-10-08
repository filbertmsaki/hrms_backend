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
} from 'typeorm';
import { EmployeeKpi } from './employee-kpi.entity';

@Entity('employee_kpi_cycle_reviews')
@Unique('UQ_employee_kpi_cycle_review_kind', ['employeeKpiId', 'kind'])
@Index('IDX_employee_kpi_cycle_review_company_status', [
  'companyId',
  'kind',
  'status',
])
export class EmployeeKpiCycleReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_period_id', type: 'int' })
  performancePeriodId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'employee_kpi_id', type: 'int' })
  employeeKpiId: number;

  @Column({ type: 'varchar', length: 12 })
  kind: 'MID' | 'FINAL';

  @Column({ type: 'varchar', length: 24, default: 'PENDING' })
  status:
    | 'PENDING'
    | 'SELF_SUBMITTED'
    | 'MANAGER_SUBMITTED'
    | 'ACKNOWLEDGED'
    | 'DISPUTED'
    | 'FINALIZED';

  @Column({
    name: 'self_rating',
    type: 'decimal',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  selfRating: string | null;

  @Column({ name: 'self_comment', type: 'text', nullable: true })
  selfComment: string | null;

  @Column({ name: 'self_submitted_at', type: 'timestamptz', nullable: true })
  selfSubmittedAt: Date | null;

  @Column({
    name: 'manager_rating',
    type: 'decimal',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  managerRating: string | null;

  @Column({ name: 'manager_comment', type: 'text', nullable: true })
  managerComment: string | null;

  @Column({ name: 'manager_submitted_at', type: 'timestamptz', nullable: true })
  managerSubmittedAt: Date | null;

  @Column({ name: 'manager_on_behalf', type: 'boolean', default: false })
  managerOnBehalf: boolean;

  @Column({ name: 'dispute_comment', type: 'text', nullable: true })
  disputeComment: string | null;

  @Column({ name: 'disputed_at', type: 'timestamptz', nullable: true })
  disputedAt: Date | null;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @Column({
    name: 'weighted_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
  })
  weightedScore: string | null;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => EmployeeKpi, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employee_kpi_id' })
  employeeKpi: EmployeeKpi;
}
