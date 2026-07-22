import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportExecution } from './report-execution.entity';
import { ReportTemplate } from './report-template.entity';

/**
 * Global catalog of report types the platform can generate. Company templates
 * point to these definitions instead of duplicating generator metadata.
 */
@Entity('report_definitions')
@Index('UQ_report_definitions_report_code', ['reportCode'], { unique: true })
@Index('IDX_report_definitions_is_active', ['isActive'])
export class ReportDefinition {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'report_code', type: 'varchar', length: 100 })
  reportCode: string;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'supported_filters',
    type: 'jsonb',
    nullable: true,
    comment: 'JSON schema-like metadata describing supported runtime filters.',
  })
  supportedFilters: Record<string, unknown> | null;

  @Column({
    name: 'supported_formats',
    type: 'enum',
    enum: ReportOutputFormatEnum,
    enumName: 'report_output_format_enum',
    array: true,
  })
  supportedFormats: ReportOutputFormatEnum[];

  @Column({ name: 'generator_service', type: 'varchar', length: 150 })
  generatorService: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ReportTemplate, (template) => template.reportDefinition)
  templates: ReportTemplate[];

  @OneToMany(() => ReportExecution, (execution) => execution.reportDefinition)
  executions: ReportExecution[];
}
