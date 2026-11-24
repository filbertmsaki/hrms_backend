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
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Department } from '../../departments/entities/department.entity';
import { Position } from '../../positions/entities/position.entity';
import { EmployeeGrade } from '../../grades/entities/employee-grade.entity';
import { EmploymentTypeEnum } from '../../employees/enums/employment-type.enum';
import { ProbationPolicyCriterion } from './probation-policy-criterion.entity';

@Entity('probation_policies')
@Unique('UQ_probation_policy_company_code', ['companyId', 'code'])
@Index('IDX_probation_policy_company_status', ['companyId', 'status'])
export class ProbationPolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'employment_type',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  employmentType: EmploymentTypeEnum | null;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({ name: 'position_id', type: 'int', nullable: true })
  positionId: number | null;

  @Column({ name: 'grade_id', type: 'int', nullable: true })
  gradeId: number | null;

  @Column({ name: 'probation_period_days', type: 'int' })
  probationPeriodDays: number;

  @Column({ name: 'self_assessment_required', default: false })
  selfAssessmentRequired: boolean;

  @Column({ name: 'objectives_required', default: true })
  objectivesRequired: boolean;

  @Column({
    name: 'minimum_confirmation_score',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 60,
  })
  minimumConfirmationScore: string;

  @Column({ name: 'maximum_extensions', type: 'int', default: 2 })
  maximumExtensions: number;

  @Column({ name: 'default_extension_days', type: 'int', default: 90 })
  defaultExtensionDays: number;

  @Column({ name: 'maximum_extension_days', type: 'int', default: 180 })
  maximumExtensionDays: number;

  @Column({ name: 'reminder_days', type: 'jsonb', nullable: true })
  reminderDays: number[] | null;

  @Column({ name: 'manager_review_required', default: true })
  managerReviewRequired: boolean;

  @Column({ name: 'hr_approval_required', default: true })
  hrApprovalRequired: boolean;

  @Column({ name: 'confirmation_letter_required', default: true })
  confirmationLetterRequired: boolean;

  @Column({ name: 'priority', type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @ManyToOne(() => Position, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'position_id' })
  position: Position | null;

  @ManyToOne(() => EmployeeGrade, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'grade_id' })
  grade: EmployeeGrade | null;

  @OneToMany(() => ProbationPolicyCriterion, (criterion) => criterion.policy, {
    cascade: true,
  })
  criteria: ProbationPolicyCriterion[];
}
