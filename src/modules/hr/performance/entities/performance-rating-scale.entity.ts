import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';
import { PerformanceRatingBand } from './performance-rating-band.entity';

@Entity('performance_rating_scales')
@Unique('UQ_performance_rating_scale_company_code', ['companyId', 'code'])
export class PerformanceRatingScale {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 60 })
  code: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({
    name: 'minimum_score',
    type: 'decimal',
    precision: 7,
    scale: 2,
    default: 0,
  })
  minimumScore: string;

  @Column({
    name: 'maximum_score',
    type: 'decimal',
    precision: 7,
    scale: 2,
    default: 100,
  })
  maximumScore: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @VersionColumn()
  version: number;

  @OneToMany(() => PerformanceRatingBand, (band) => band.ratingScale, {
    cascade: true,
  })
  bands: PerformanceRatingBand[];
}
