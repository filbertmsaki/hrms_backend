import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PerformanceCompetencyCategoryEnum } from '../enums/performance-competency-category.enum';
import { CompetencyTemplate } from './competency-template.entity';

@Entity('competency_template_items')
export class CompetencyTemplateItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'template_id', type: 'int' })
  templateId: number;

  @Column({ type: 'varchar', length: 60 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: PerformanceCompetencyCategoryEnum,
    enumName: 'performance_competency_category_enum',
    default: PerformanceCompetencyCategoryEnum.BEHAVIORAL,
  })
  category: PerformanceCompetencyCategoryEnum;

  @Column({ name: 'weight', type: 'decimal', precision: 7, scale: 2 })
  weight: string;

  @Column({
    name: 'maximum_rating',
    type: 'decimal',
    precision: 7,
    scale: 2,
    default: 5,
  })
  maximumRating: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @ManyToOne(() => CompetencyTemplate, (template) => template.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: CompetencyTemplate;
}
