import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { KpiDefinition } from './kpi-definition.entity';
import { KpiDataSourceTypeEnum } from '../enums/kpi-data-source-type.enum';
import { KpiMeasurementDirectionEnum } from '../enums/kpi-measurement-direction.enum';
import { KpiScoringFormulaEnum } from '../enums/kpi-scoring-formula.enum';
import { PerformancePeriodTypeEnum } from '../enums/performance-period-type.enum';

@Entity('kpi_definition_versions')
@Unique('UQ_kpi_definition_version', ['kpiDefinitionId', 'versionNumber'])
export class KpiDefinitionVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'kpi_definition_id', type: 'int' })
  kpiDefinitionId: number;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber: number;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'measurement_unit', type: 'varchar', length: 80 })
  measurementUnit: string;

  @Column({
    name: 'measurement_direction',
    type: 'enum',
    enum: KpiMeasurementDirectionEnum,
  })
  measurementDirection: KpiMeasurementDirectionEnum;

  @Column({
    name: 'scoring_formula',
    type: 'enum',
    enum: KpiScoringFormulaEnum,
  })
  scoringFormula: KpiScoringFormulaEnum;

  @Column({ name: 'formula_configuration', type: 'jsonb', nullable: true })
  formulaConfiguration: Record<string, unknown> | null;

  @Column({
    name: 'data_source_type',
    type: 'enum',
    enum: KpiDataSourceTypeEnum,
  })
  dataSourceType: KpiDataSourceTypeEnum;

  @Column({ name: 'data_source_configuration', type: 'jsonb', nullable: true })
  dataSourceConfiguration: Record<string, unknown> | null;

  @Column({ name: 'default_target_value', type: 'decimal', precision: 14, scale: 4, nullable: true })
  defaultTargetValue: string | null;

  @Column({
    name: 'frequency',
    type: 'enum',
    enum: PerformancePeriodTypeEnum,
    default: PerformancePeriodTypeEnum.MONTHLY,
  })
  frequency: PerformancePeriodTypeEnum;

  @Column({
    name: 'approval_authority',
    type: 'varchar',
    length: 50,
    default: 'HR',
  })
  approvalAuthority: string;

  @Column({ name: 'manual_entry_allowed', type: 'boolean', default: true })
  manualEntryAllowed: boolean;

  @Column({ name: 'evidence_required', type: 'boolean', default: false })
  evidenceRequired: boolean;

  @Column({ name: 'applicability_snapshot', type: 'jsonb', nullable: true })
  applicabilitySnapshot: Record<string, unknown> | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => KpiDefinition, (definition) => definition.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'kpi_definition_id' })
  kpiDefinition: KpiDefinition;
}
