import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { ProbationCase } from './probation-case.entity';
import { ProbationObjectiveStatusEnum } from '../enums/probation-objective-status.enum';

@Entity('probation_objectives')
@Index('IDX_probation_objective_case_cycle', [
  'probationCaseId',
  'reviewCycleId',
])
export class ProbationObjective {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'probation_case_id' })
  probationCaseId: number;

  @Column({ name: 'review_cycle_id' })
  reviewCycleId: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'expected_result', type: 'text', nullable: true })
  expectedResult: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  weight: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: ProbationObjectiveStatusEnum.NOT_STARTED,
  })
  status: ProbationObjectiveStatusEnum;

  @Column({
    name: 'employee_progress_comment',
    type: 'text',
    nullable: true,
  })
  employeeProgressComment: string | null;

  @Column({
    name: 'employee_completion_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  employeeCompletionPercent: string;

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

  @Column({ name: 'evidence_document_id', type: 'int', nullable: true })
  evidenceDocumentId: number | null;

  @Column({
    name: 'created_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  createdByCompanyUserId: number | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => ProbationCase, (probationCase) => probationCase.objectives, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'probation_case_id' })
  probationCase: ProbationCase;
}
