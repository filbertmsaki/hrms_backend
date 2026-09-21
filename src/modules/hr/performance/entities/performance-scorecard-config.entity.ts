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
import { PerformanceScorecardComponentTypeEnum } from '../enums/performance-scorecard-component-type.enum';

export type PerformanceScorecardComponent = {
  code: string;
  label: string;
  type: PerformanceScorecardComponentTypeEnum;
  weight: number;
  enabled: boolean;
  required?: boolean;
  cap?: number | null;
  floor?: number | null;
  configuration?: Record<string, unknown> | null;
};

@Entity('performance_scorecard_configs')
@Unique('UQ_performance_scorecard_company_code', ['companyId', 'code'])
@Index('IDX_performance_scorecard_company_status_default', [
  'companyId',
  'status',
  'isDefault',
])
export class PerformanceScorecardConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'effective_from', type: 'date', nullable: true })
  effectiveFrom: string | null;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ type: 'jsonb' })
  components: PerformanceScorecardComponent[];

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
