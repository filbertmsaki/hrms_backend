import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AttendanceDeductionRules } from '../services/payroll-attendance-deductions.util';

export enum PayrollAttendanceDeductionPolicyStatusEnum {
  /** Configured and reportable, never applied to pay. */
  DRAFT = 'DRAFT',
  /** HR-approved with a recorded legal review; applied to pay. */
  ACTIVE = 'ACTIVE',
  RETIRED = 'RETIRED',
}

/**
 * Attendance deduction policy. Money is only deducted from an ACTIVE policy,
 * which needs an approver other than its author and a recorded legal review
 * reference. New policies start as DRAFT.
 */
@Entity('payroll_attendance_deduction_policies')
@Index('IDX_payroll_attendance_deduction_policy_company', [
  'companyId',
  'status',
])
export class PayrollAttendanceDeductionPolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ type: 'jsonb' })
  rules: AttendanceDeductionRules;

  @Column({
    type: 'varchar',
    length: 20,
    default: PayrollAttendanceDeductionPolicyStatusEnum.DRAFT,
  })
  status: PayrollAttendanceDeductionPolicyStatusEnum;

  @Column({ name: 'legal_review_reference', type: 'text', nullable: true })
  legalReviewReference: string | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
