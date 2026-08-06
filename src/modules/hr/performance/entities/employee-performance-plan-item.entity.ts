import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EmployeePerformancePlan } from './employee-performance-plan.entity';
import { KpiDefinitionVersion } from './kpi-definition-version.entity';

@Entity('employee_performance_plan_items')
export class EmployeePerformancePlanItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @Column({ name: 'kpi_definition_version_id', type: 'int' })
  kpiDefinitionVersionId: number;

  @Column({ name: 'weight', type: 'decimal', precision: 7, scale: 2 })
  weight: string;

  @Column({
    name: 'target_value',
    type: 'decimal',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  targetValue: string | null;

  @Column({ name: 'manual_entry_allowed', type: 'boolean', default: true })
  manualEntryAllowed: boolean;

  @Column({ name: 'evidence_required', type: 'boolean', default: false })
  evidenceRequired: boolean;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'kpi_snapshot', type: 'jsonb' })
  kpiSnapshot: Record<string, unknown>;

  @ManyToOne(() => EmployeePerformancePlan, (plan) => plan.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'plan_id' })
  plan: EmployeePerformancePlan;

  @ManyToOne(() => KpiDefinitionVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'kpi_definition_version_id' })
  kpiDefinitionVersion: KpiDefinitionVersion;
}
