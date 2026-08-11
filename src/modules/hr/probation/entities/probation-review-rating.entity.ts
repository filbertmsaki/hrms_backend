import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ProbationReviewCycle } from './probation-review-cycle.entity';

@Entity('probation_review_ratings')
@Unique('UQ_probation_cycle_criterion', ['reviewCycleId', 'criterionCode'])
export class ProbationReviewRating {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'review_cycle_id' })
  reviewCycleId: number;

  @Column({ name: 'criterion_id', type: 'int', nullable: true })
  criterionId: number | null;

  @Column({ name: 'criterion_code', type: 'varchar', length: 80 })
  criterionCode: string;

  @Column({ name: 'criterion_name', type: 'varchar', length: 180 })
  criterionName: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  weight: string;

  @Column({ name: 'maximum_rating', type: 'decimal', precision: 5, scale: 2 })
  maximumRating: string;

  @Column({
    name: 'self_rating',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  selfRating: string | null;

  @Column({ name: 'self_comment', type: 'text', nullable: true })
  selfComment: string | null;

  @Column({
    name: 'manager_rating',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  managerRating: string | null;

  @Column({ name: 'manager_comment', type: 'text', nullable: true })
  managerComment: string | null;

  @Column({
    name: 'weighted_score',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  weightedScore: string | null;

  @ManyToOne(() => ProbationReviewCycle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_cycle_id' })
  reviewCycle: ProbationReviewCycle;
}
