import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';
import { PerformanceCompetencyCategoryEnum } from '../enums/performance-competency-category.enum';

@Entity('performance_competency_ratings')
@Unique('UQ_performance_competency_review_item', [
  'performanceReviewId',
  'templateItemCode',
])
@Index('IDX_performance_competency_review', ['performanceReviewId'])
export class PerformanceCompetencyRating {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_review_id', type: 'int' })
  performanceReviewId: number;

  @Column({ name: 'template_item_code', type: 'varchar', length: 60 })
  templateItemCode: string;

  @Column({ name: 'template_item_name', type: 'varchar', length: 180 })
  templateItemName: string;

  @Column({
    type: 'enum',
    enum: PerformanceCompetencyCategoryEnum,
    enumName: 'performance_competency_category_enum',
    default: PerformanceCompetencyCategoryEnum.BEHAVIORAL,
  })
  category: PerformanceCompetencyCategoryEnum;

  @Column({ name: 'weight', type: 'decimal', precision: 7, scale: 2 })
  weight: string;

  @Column({ name: 'maximum_rating', type: 'decimal', precision: 7, scale: 2 })
  maximumRating: string;

  @Column({
    name: 'employee_rating',
    type: 'decimal',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  employeeRating: string | null;

  @Column({
    name: 'manager_rating',
    type: 'decimal',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  managerRating: string | null;

  @Column({
    name: 'hr_rating',
    type: 'decimal',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  hrRating: string | null;

  @Column({ name: 'manager_comment', type: 'text', nullable: true })
  managerComment: string | null;

  @Column({ name: 'hr_comment', type: 'text', nullable: true })
  hrComment: string | null;

  @VersionColumn()
  version: number;
}
