import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ProbationCase } from './probation-case.entity';
import { ProbationReviewCycle } from './probation-review-cycle.entity';

@Entity('probation_extensions')
@Unique('UQ_probation_case_extension_number', [
  'probationCaseId',
  'extensionNumber',
])
export class ProbationExtension {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'probation_case_id' })
  probationCaseId: number;

  @Column({ name: 'review_cycle_id' })
  reviewCycleId: number;

  @Column({ name: 'extension_number' })
  extensionNumber: number;

  @Column({ name: 'previous_end_date', type: 'date' })
  previousEndDate: string;

  @Column({ name: 'new_start_date', type: 'date' })
  newStartDate: string;

  @Column({ name: 'new_end_date', type: 'date' })
  newEndDate: string;

  @Column({ name: 'extension_days' })
  extensionDays: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'improvement_plan', type: 'text', nullable: true })
  improvementPlan: string | null;

  @Column({ name: 'approved_by_company_user_id' })
  approvedByCompanyUserId: number;

  @Column({ name: 'approved_at', type: 'timestamptz' })
  approvedAt: Date;

  @Column({ name: 'extension_document_id', type: 'int', nullable: true })
  extensionDocumentId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => ProbationCase, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'probation_case_id' })
  probationCase: ProbationCase;

  @ManyToOne(() => ProbationReviewCycle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_cycle_id' })
  reviewCycle: ProbationReviewCycle;
}
