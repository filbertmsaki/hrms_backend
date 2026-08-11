import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { ProbationPolicy } from './probation-policy.entity';
import { ProbationCaseStatusEnum } from '../enums/probation-case-status.enum';
import { ProbationFinalDecisionEnum } from '../enums/probation-final-decision.enum';
import { ProbationReviewCycle } from './probation-review-cycle.entity';
import { ProbationObjective } from './probation-objective.entity';

@Entity('probation_cases')
@Unique('UQ_probation_case_company_no', ['companyId', 'caseNo'])
@Index('IDX_probation_case_company_status', ['companyId', 'status'])
@Index('IDX_probation_case_due_date', ['currentDueDate', 'status'])
export class ProbationCase {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'policy_id', type: 'int', nullable: true })
  policyId: number | null;

  @Column({ name: 'case_no', type: 'varchar', length: 60 })
  caseNo: string;

  @Column({
    type: 'varchar',
    length: 40,
    default: ProbationCaseStatusEnum.DRAFT,
  })
  status: ProbationCaseStatusEnum;

  @Column({ name: 'original_start_date', type: 'date' })
  originalStartDate: string;

  @Column({ name: 'original_due_date', type: 'date' })
  originalDueDate: string;

  @Column({ name: 'current_start_date', type: 'date' })
  currentStartDate: string;

  @Column({ name: 'current_due_date', type: 'date' })
  currentDueDate: string;

  @Column({ name: 'current_cycle_number', type: 'int', default: 1 })
  currentCycleNumber: number;

  @Column({ name: 'extension_count', type: 'int', default: 0 })
  extensionCount: number;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'manager_company_user_id', type: 'int', nullable: true })
  managerCompanyUserId: number | null;

  @Column({ name: 'policy_snapshot', type: 'jsonb', nullable: true })
  policySnapshot: Record<string, unknown> | null;

  @Column({ name: 'employee_snapshot', type: 'jsonb' })
  employeeSnapshot: Record<string, unknown>;

  @Column({
    name: 'final_decision',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  finalDecision: ProbationFinalDecisionEnum | null;

  @Column({ name: 'final_decision_reason', type: 'text', nullable: true })
  finalDecisionReason: string | null;

  @Column({ name: 'confirmation_date', type: 'date', nullable: true })
  confirmationDate: string | null;

  @Column({
    name: 'finalized_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  finalizedByCompanyUserId: number | null;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;

  @Column({
    name: 'confirmation_document_id',
    type: 'int',
    nullable: true,
  })
  confirmationDocumentId: number | null;

  @Column({ name: 'last_reminder_at', type: 'timestamptz', nullable: true })
  lastReminderAt: Date | null;

  @Column({ name: 'reminder_count', type: 'int', default: 0 })
  reminderCount: number;

  @Column({ name: 'latest_evidence_snapshot', type: 'jsonb', nullable: true })
  latestEvidenceSnapshot: Record<string, unknown> | null;

  @Column({
    name: 'latest_evidence_hash',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  latestEvidenceHash: string | null;

  @Column({
    name: 'created_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  createdByCompanyUserId: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => ProbationPolicy, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'policy_id' })
  policy: ProbationPolicy | null;

  @OneToMany(() => ProbationReviewCycle, (cycle) => cycle.probationCase)
  reviewCycles: ProbationReviewCycle[];

  @OneToMany(() => ProbationObjective, (objective) => objective.probationCase)
  objectives: ProbationObjective[];
}
