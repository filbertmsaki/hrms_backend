import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProbationPolicy } from './probation-policy.entity';

@Entity('probation_policy_criteria')
@Unique('UQ_probation_policy_criterion_code', ['policyId', 'code'])
export class ProbationPolicyCriterion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'policy_id' })
  policyId: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  weight: string;

  @Column({
    name: 'maximum_rating',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 5,
  })
  maximumRating: string;

  @Column({ name: 'self_rating_enabled', default: false })
  selfRatingEnabled: boolean;

  @Column({ name: 'is_required', default: true })
  isRequired: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => ProbationPolicy, (policy) => policy.criteria, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'policy_id' })
  policy: ProbationPolicy;
}
