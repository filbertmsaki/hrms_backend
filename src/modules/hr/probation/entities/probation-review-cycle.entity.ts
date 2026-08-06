import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { ProbationCase } from './probation-case.entity';
import { ProbationReviewCycleStatusEnum } from '../enums/probation-review-cycle-status.enum';
import { ProbationManagerRecommendationEnum } from '../enums/probation-manager-recommendation.enum';
import { ProbationFinalDecisionEnum } from '../enums/probation-final-decision.enum';

@Entity('probation_review_cycles')
@Unique('UQ_probation_case_cycle', ['probationCaseId', 'cycleNumber'])
export class ProbationReviewCycle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'probation_case_id' })
  probationCaseId: number;

  @Column({ name: 'cycle_number' })
  cycleNumber: number;

  @Column({ name: 'period_start_date', type: 'date' })
  periodStartDate: string;

  @Column({ name: 'period_end_date', type: 'date' })
  periodEndDate: string;

  @Column({
    type: 'varchar',
    length: 40,
    default: ProbationReviewCycleStatusEnum.ACTIVE,
  })
  status: ProbationReviewCycleStatusEnum;

  @Column({ name: 'self_assessment_required', default: false })
  selfAssessmentRequired: boolean;

  @Column({ name: 'self_assessment', type: 'jsonb', nullable: true })
  selfAssessment: Record<string, unknown> | null;

  @Column({
    name: 'self_assessment_submitted_at',
    type: 'timestamptz',
    nullable: true,
  })
  selfAssessmentSubmittedAt: Date | null;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'manager_company_user_id', type: 'int', nullable: true })
  managerCompanyUserId: number | null;

  @Column({
    name: 'manager_recommendation',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  managerRecommendation: ProbationManagerRecommendationEnum | null;

  @Column({
    name: 'manager_score',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  managerScore: string | null;

  @Column({ name: 'manager_comments', type: 'text', nullable: true })
  managerComments: string | null;

  @Column({ name: 'manager_reviewed_at', type: 'timestamptz', nullable: true })
  managerReviewedAt: Date | null;

  @Column({ name: 'hr_company_user_id', type: 'int', nullable: true })
  hrCompanyUserId: number | null;

  @Column({
    name: 'hr_decision',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  hrDecision: ProbationFinalDecisionEnum | null;

  @Column({ name: 'hr_comments', type: 'text', nullable: true })
  hrComments: string | null;

  @Column({ name: 'hr_reviewed_at', type: 'timestamptz', nullable: true })
  hrReviewedAt: Date | null;

  @Column({ name: 'evidence_snapshot', type: 'jsonb', nullable: true })
  evidenceSnapshot: Record<string, unknown> | null;

  @Column({
    name: 'evidence_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  evidenceHash: string | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => ProbationCase, (probationCase) => probationCase.reviewCycles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'probation_case_id' })
  probationCase: ProbationCase;
}
