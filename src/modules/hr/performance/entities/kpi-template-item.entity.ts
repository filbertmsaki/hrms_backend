import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KpiDefinitionVersion } from './kpi-definition-version.entity';
import { KpiTemplate } from './kpi-template.entity';

@Entity('kpi_template_items')
export class KpiTemplateItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'template_id', type: 'int' })
  templateId: number;

  @Column({ name: 'kpi_definition_version_id', type: 'int' })
  kpiDefinitionVersionId: number;

  @Column({ name: 'weight', type: 'decimal', precision: 7, scale: 2 })
  weight: string;

  @Column({ name: 'target_value', type: 'decimal', precision: 14, scale: 4, nullable: true })
  targetValue: string | null;

  @Column({ name: 'manual_entry_allowed', type: 'boolean', default: true })
  manualEntryAllowed: boolean;

  @Column({ name: 'evidence_required', type: 'boolean', default: false })
  evidenceRequired: boolean;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => KpiTemplate, (template) => template.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: KpiTemplate;

  @ManyToOne(() => KpiDefinitionVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'kpi_definition_version_id' })
  kpiDefinitionVersion: KpiDefinitionVersion;
}
