import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('employee_kpi_cycle_scores')
@Unique('UQ_employee_kpi_cycle_score_employee_period', [
  'performancePeriodId',
  'employeeId',
])
@Index('IDX_employee_kpi_cycle_score_company_period', [
  'companyId',
  'performancePeriodId',
])
export class EmployeeKpiCycleScore {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_period_id', type: 'int' })
  performancePeriodId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({
    name: 'total_weighted_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
  })
  totalWeightedScore: string;

  @Column({ name: 'final_rating_band', type: 'varchar', length: 60 })
  finalRatingBand: string;

  @Column({ type: 'varchar', length: 16, default: 'LOCKED' })
  status: 'LOCKED' | 'REOPENED';

  @Column({ name: 'finalized_at', type: 'timestamptz' })
  finalizedAt: Date;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'revision', type: 'int', default: 1 })
  revision: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
