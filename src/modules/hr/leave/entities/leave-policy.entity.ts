import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Department } from '../../departments/entities/department.entity';
import { EmployeeGrade } from '../../grades/entities/employee-grade.entity';
import { Position } from '../../positions/entities/position.entity';
import { LeaveAccrualMethodEnum } from '../enums/leave-accrual-method.enum';
import { LeaveDayTreatmentEnum } from '../enums/leave-day-treatment.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeavePolicyType } from './leave-policy-type.entity';

@Entity('leave_policies')
@Index('IDX_leave_policy_company', ['company_id'])
@Index('IDX_leave_policy_branch', ['applicable_branch_id'])
@Index('IDX_leave_policy_department', ['applicable_department_id'])
@Index('IDX_leave_policy_position', ['applicable_position_id'])
@Index('IDX_leave_policy_grade', ['applicable_grade_id'])
export class LeavePolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', nullable: true })
  applicable_branch_id: number | null;

  @Column({ type: 'int', nullable: true })
  applicable_department_id: number | null;

  @Column({ type: 'int', nullable: true })
  applicable_position_id: number | null;

  @Column({ type: 'int', nullable: true })
  applicable_grade_id: number | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  applicable_employment_type: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  applicable_confirmation_status: string | null;

  @Column({
    type: 'enum',
    enum: LeaveAccrualMethodEnum,
    default: LeaveAccrualMethodEnum.YEARLY,
  })
  accrual_method: LeaveAccrualMethodEnum;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  accrual_rate: string | null;

  @Column({ type: 'int', nullable: true })
  max_consecutive_days: number | null;

  @Column({ type: 'int', default: 0 })
  min_service_months: number;

  @Column({ default: true })
  allow_during_probation: boolean;

  @Column({ default: false })
  allow_negative_balance: boolean;

  @Column({
    type: 'enum',
    enum: LeaveDayTreatmentEnum,
    default: LeaveDayTreatmentEnum.EMPLOYEE_SCHEDULE,
  })
  weekly_off_treatment: LeaveDayTreatmentEnum;

  @Column({
    type: 'enum',
    enum: LeaveDayTreatmentEnum,
    default: LeaveDayTreatmentEnum.EXCLUDE,
  })
  holiday_treatment: LeaveDayTreatmentEnum;

  @Column({ default: false })
  allow_half_day: boolean;

  @Column({ default: false })
  allow_short_leave: boolean;

  @Column({ type: 'int', nullable: true })
  minimum_short_leave_minutes: number | null;

  @Column({ type: 'int', nullable: true })
  maximum_short_leave_minutes: number | null;

  @Column({ type: 'int', nullable: true })
  minimum_notice_days: number | null;

  @Column({ type: 'int', default: 0 })
  maximum_backdate_days: number;

  @Column({ default: false })
  cancellation_requires_approval: boolean;

  @Column({ type: 'int', default: 0 })
  cancellation_cutoff_days: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  maximum_accumulation_days: string | null;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ default: false })
  attendance_balance_deduction_enabled: boolean;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 1 })
  absent_day_deduction_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 1 })
  unpaid_leave_day_deduction_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0.5 })
  half_day_deduction_days: string;

  @Column({
    type: 'enum',
    enum: LeaveRecordStatusEnum,
    default: LeaveRecordStatusEnum.ACTIVE,
  })
  status: LeaveRecordStatusEnum;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applicable_branch_id' })
  applicable_branch: Branch | null;

  @ManyToOne(() => Department, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applicable_department_id' })
  applicable_department: Department | null;

  @ManyToOne(() => Position, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applicable_position_id' })
  applicable_position: Position | null;

  @ManyToOne(() => EmployeeGrade, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applicable_grade_id' })
  applicable_grade: EmployeeGrade | null;

  @OneToMany(() => LeavePolicyType, (policyType) => policyType.policy, {
    cascade: true,
  })
  leave_types: LeavePolicyType[];
}
