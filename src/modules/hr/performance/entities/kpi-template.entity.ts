import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { KpiTemplateItem } from './kpi-template-item.entity';
import { KpiTemplateStatusEnum } from '../enums/kpi-template-status.enum';

@Entity('kpi_templates')
@Unique('UQ_kpi_template_company_code', ['companyId', 'code'])
@Index('IDX_kpi_template_company_status', ['companyId', 'status'])
export class KpiTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: KpiTemplateStatusEnum,
    enumName: 'kpi_template_status_enum',
    default: KpiTemplateStatusEnum.DRAFT,
  })
  status: KpiTemplateStatusEnum;

  @Column({ name: 'review_cycle', type: 'varchar', length: 40, nullable: true })
  reviewCycle: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => KpiTemplateItem, (item) => item.template, { cascade: true })
  items: KpiTemplateItem[];
}
