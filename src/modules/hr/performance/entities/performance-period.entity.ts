import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
  VersionColumn,
} from 'typeorm';
import { PerformanceFinancialYear } from './performance-financial-year.entity';
import { PerformancePeriodStatusEnum } from '../enums/performance-period-status.enum';
import { PerformancePeriodTypeEnum } from '../enums/performance-period-type.enum';

@Entity('performance_periods')
@Unique('UQ_performance_period_year_type_sequence', [
  'financialYearId',
  'periodType',
  'sequenceNumber',
])
@Index('IDX_performance_period_company_status', ['companyId', 'status'])
@Index('IDX_performance_period_dates', ['startDate', 'endDate'])
export class PerformancePeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'financial_year_id', type: 'int' })
  financialYearId: number;

  @Column({
    name: 'period_type',
    type: 'enum',
    enum: PerformancePeriodTypeEnum,
    enumName: 'performance_period_type_enum',
  })
  periodType: PerformancePeriodTypeEnum;

  @Column({ name: 'sequence_number', type: 'int' })
  sequenceNumber: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'kpi_phase', type: 'varchar', length: 32, nullable: true })
  kpiPhase: string | null;

  @Column({ name: 'goal_setting_deadline', type: 'date', nullable: true })
  goalSettingDeadline: string | null;

  @Column({ name: 'mid_cycle_review_date', type: 'date', nullable: true })
  midCycleReviewDate: string | null;

  @Column({ name: 'final_review_deadline', type: 'date', nullable: true })
  finalReviewDeadline: string | null;

  @Column({ name: 'allow_parallel', type: 'boolean', default: true })
  allowParallel: boolean;

  @Column({
    name: 'max_weightage',
    type: 'decimal',
    precision: 7,
    scale: 2,
    default: 100,
  })
  maxWeightage: string;

  @Column({
    name: 'score_cap',
    type: 'decimal',
    precision: 7,
    scale: 2,
    default: 120,
  })
  scoreCap: string;

  @Column({ name: 'cooling_period_days', type: 'integer', default: 0 })
  coolingPeriodDays: number;

  @Column({ name: 'kpi_reopen_reason', type: 'text', nullable: true })
  kpiReopenReason: string | null;

  @Column({ name: 'kpi_rating_bands', type: 'jsonb', nullable: true })
  kpiRatingBands: Array<{ label: string; min: number }> | null;

  @Column({
    type: 'enum',
    enum: PerformancePeriodStatusEnum,
    enumName: 'performance_period_status_enum',
    default: PerformancePeriodStatusEnum.DRAFT,
  })
  status: PerformancePeriodStatusEnum;

  @Column({
    name: 'achievement_entry_opens_at',
    type: 'timestamptz',
    nullable: true,
  })
  achievementEntryOpensAt: Date | null;

  @Column({
    name: 'achievement_entry_closes_at',
    type: 'timestamptz',
    nullable: true,
  })
  achievementEntryClosesAt: Date | null;

  @Column({ name: 'self_review_due_at', type: 'timestamptz', nullable: true })
  selfReviewDueAt: Date | null;

  @Column({
    name: 'manager_review_due_at',
    type: 'timestamptz',
    nullable: true,
  })
  managerReviewDueAt: Date | null;

  @Column({ name: 'hr_review_due_at', type: 'timestamptz', nullable: true })
  hrReviewDueAt: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'generation_snapshot', type: 'jsonb', nullable: true })
  generationSnapshot: Record<string, unknown> | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => PerformanceFinancialYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'financial_year_id' })
  financialYear: PerformanceFinancialYear;
}
