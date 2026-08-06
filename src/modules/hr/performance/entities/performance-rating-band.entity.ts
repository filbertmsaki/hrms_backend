import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PerformanceRatingScale } from './performance-rating-scale.entity';

@Entity('performance_rating_bands')
@Unique('UQ_performance_rating_band_scale_code', ['ratingScaleId', 'code'])
export class PerformanceRatingBand {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'rating_scale_id', type: 'int' })
  ratingScaleId: number;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ name: 'minimum_score', type: 'decimal', precision: 7, scale: 2 })
  minimumScore: string;

  @Column({ name: 'maximum_score', type: 'decimal', precision: 7, scale: 2 })
  maximumScore: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({
    name: 'requires_improvement_plan',
    type: 'boolean',
    default: false,
  })
  requiresImprovementPlan: boolean;

  @ManyToOne(() => PerformanceRatingScale, (scale) => scale.bands, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'rating_scale_id' })
  ratingScale: PerformanceRatingScale;
}
