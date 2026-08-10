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

@Entity('performance_financial_years')
@Unique('UQ_performance_financial_year_company_code', ['companyId', 'code'])
@Index('IDX_performance_financial_year_company_status', ['companyId', 'status'])
export class PerformanceFinancialYear {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  @Column({
    name: 'annual_aggregation_method',
    type: 'enum',
    enum: PerformanceAggregationMethodEnum,
    enumName: 'performance_aggregation_method_enum',
    default: PerformanceAggregationMethodEnum.SIMPLE_MONTHLY_AVERAGE,
  })
  annualAggregationMethod: PerformanceAggregationMethodEnum;

  @Column({
    name: 'aggregation_configuration',
    type: 'jsonb',
    nullable: true,
  })
  aggregationConfiguration: Record<string, unknown> | null;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({
    name: 'locked_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  lockedByCompanyUserId: number | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
