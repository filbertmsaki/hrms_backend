import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('performance_review_moderations')
@Index('IDX_performance_review_moderation_review', ['performanceReviewId'])
export class PerformanceReviewModeration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_review_id', type: 'int' })
  performanceReviewId: number;

  @Column({ name: 'moderated_by_company_user_id', type: 'int', nullable: true })
  moderatedByCompanyUserId: number | null;

  @Column({
    name: 'previous_final_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
  })
  previousFinalScore: string | null;

  @Column({
    name: 'new_final_score',
    type: 'decimal',
    precision: 9,
    scale: 4,
    nullable: true,
  })
  newFinalScore: string | null;

  @Column({ name: 'reason', type: 'text' })
  reason: string;

  @Column({ name: 'snapshot', type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
