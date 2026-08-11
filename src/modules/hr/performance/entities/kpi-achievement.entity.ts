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
import { KpiAchievementStatusEnum } from '../enums/kpi-achievement-status.enum';
import { KpiDataSourceTypeEnum } from '../enums/kpi-data-source-type.enum';
import { EmployeePerformancePlanItem } from './employee-performance-plan-item.entity';
import { PerformancePeriodAssignment } from './performance-period-assignment.entity';

@Entity('kpi_achievements')
@Unique('UQ_kpi_achievement_period_item', ['periodAssignmentId', 'planItemId'])
@Index('IDX_kpi_achievement_company_status', ['companyId', 'status'])
export class KpiAchievement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'period_assignment_id', type: 'int' })
  periodAssignmentId: number;

  @Column({ name: 'plan_item_id', type: 'int' })
  planItemId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({
    name: 'target_value',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  targetValue: string | null;

  @Column({
    name: 'achievement_value',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  achievementValue: string | null;

  @Column({
    name: 'raw_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
  })
  rawScore: string | null;

  @Column({
    name: 'capped_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
  })
  cappedScore: string | null;

  @Column({
    name: 'weighted_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
  })
  weightedScore: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: KpiAchievementStatusEnum,
    enumName: 'kpi_achievement_status_enum',
    default: KpiAchievementStatusEnum.NOT_STARTED,
  })
  status: KpiAchievementStatusEnum;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: KpiDataSourceTypeEnum,
    enumName: 'kpi_data_source_type_enum',
  })
  sourceType: KpiDataSourceTypeEnum;

  @Column({ name: 'achievement_snapshot', type: 'jsonb' })
  achievementSnapshot: Record<string, unknown>;

  @Column({ name: 'evidence', type: 'jsonb', nullable: true })
  evidence: Record<string, unknown>[] | null;

  @Column({ name: 'manager_comment', type: 'text', nullable: true })
  managerComment: string | null;

  @Column({ name: 'hr_comment', type: 'text', nullable: true })
  hrComment: string | null;

  @Column({ name: 'override_reason', type: 'text', nullable: true })
  overrideReason: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({
    name: 'manager_validated_at',
    type: 'timestamptz',
    nullable: true,
  })
  managerValidatedAt: Date | null;

  @Column({ name: 'hr_approved_at', type: 'timestamptz', nullable: true })
  hrApprovedAt: Date | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => PerformancePeriodAssignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_assignment_id' })
  periodAssignment: PerformancePeriodAssignment;

  @ManyToOne(() => EmployeePerformancePlanItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_item_id' })
  planItem: EmployeePerformancePlanItem;
}
