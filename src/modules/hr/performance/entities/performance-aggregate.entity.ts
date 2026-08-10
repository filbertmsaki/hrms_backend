import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { PerformanceAggregationMethodEnum } from '../enums/performance-aggregation-method.enum';
import { PerformancePeriodTypeEnum } from '../enums/performance-period-type.enum';

@Entity('performance_aggregates')
@Unique('UQ_performance_aggregate_employee_period', [
  'companyId',
  'employeeId',
  'financialYearId',
  'periodType',
  'sequenceNumber',
])
@Index('IDX_performance_aggregate_company_type', ['companyId', 'periodType'])
export class PerformanceAggregate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

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

  @Column({
    name: 'aggregation_method',
    type: 'enum',
    enum: PerformanceAggregationMethodEnum,
    enumName: 'performance_aggregation_method_enum',
  })
  aggregationMethod: PerformanceAggregationMethodEnum;

  @Column({ name: 'aggregate_score', type: 'decimal', precision: 9, scale: 4 })
  aggregateScore: string;

  @Column({ name: 'rating_code', type: 'varchar', length: 40, nullable: true })
  ratingCode: string | null;

  @Column({ name: 'source_review_hashes', type: 'jsonb' })
  sourceReviewHashes: string[];

  @Column({ name: 'calculation_snapshot', type: 'jsonb' })
  calculationSnapshot: Record<string, unknown>;

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
}
