import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { CompetencyTemplateItem } from './competency-template-item.entity';

@Entity('competency_templates')
@Unique('UQ_competency_template_company_code', ['companyId', 'code'])
export class CompetencyTemplate {
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

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => CompetencyTemplateItem, (item) => item.template, {
    cascade: true,
  })
  items: CompetencyTemplateItem[];
}
