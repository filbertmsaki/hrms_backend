import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveApprovalDelegation } from './leave-approval-delegation.entity';
import { LeaveRequest } from './leave-request.entity';

export enum LeaveActingAssignmentStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * Acting employee who covers for an employee on leave. Appointed by an
 * approver (or HR) on the leave request. Status follows the leave: pending
 * until the leave is approved and starts, active during it, completed when
 * it ends, cancelled when the leave is cancelled/rejected or the acting
 * employee is replaced (replacement keeps the old row as history).
 *
 * The acting employee inherits no permissions. When `route_approvals` is
 * set, a time-limited leave_approval_delegations row (linked here) routes
 * the absent employee's leave approvals to the acting employee and is
 * cancelled together with this assignment.
 */
@Entity('leave_acting_assignments')
@Index('IDX_leave_acting_leave_request', ['leave_request_id'])
@Index('IDX_leave_acting_absent', [
  'company_id',
  'absent_employee_id',
  'status',
])
@Index('IDX_leave_acting_acting', [
  'company_id',
  'acting_employee_id',
  'status',
])
@Index('UQ_leave_acting_open_per_request', ['leave_request_id'], {
  unique: true,
  where: `"status" <> 'CANCELLED'`,
})
@Check(
  'CHK_leave_acting_status',
  `"status" IN ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED')`,
)
@Check('CHK_leave_acting_dates', `"end_date" >= "start_date"`)
@Check(
  'CHK_leave_acting_not_self',
  `"acting_employee_id" <> "absent_employee_id"`,
)
export class LeaveActingAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  leave_request_id: number;

  @Column()
  absent_employee_id: number;

  @Column()
  acting_employee_id: number;

  /** Employee record of whoever appointed (null when appointed by a non-employee HR user). */
  @Column({ type: 'int', nullable: true })
  appointed_by_employee_id: number | null;

  @Column({ type: 'int', nullable: true })
  appointed_by_company_user_id: number | null;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date' })
  end_date: string;

  /** Dates mirror the leave dates (default) and move when the leave changes. */
  @Column({ type: 'boolean', default: true })
  follows_leave_dates: boolean;

  @Column({ type: 'text', nullable: true })
  responsibilities: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: LeaveActingAssignmentStatus.PENDING,
  })
  status: LeaveActingAssignmentStatus;

  @Column({ type: 'boolean', default: false })
  route_approvals: boolean;

  @Column({ type: 'int', nullable: true })
  approval_delegation_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  activated_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'int', nullable: true })
  cancelled_by_company_user_id: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cancellation_reason: string | null;

  /** Set when this row was replaced by another acting employee. */
  @Column({ type: 'int', nullable: true })
  replaced_by_assignment_id: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'appointed_by_company_user_id' })
  appointed_by_company_user: CompanyUser | null;

  @ManyToOne(() => CompanyUser, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cancelled_by_company_user_id' })
  cancelled_by_company_user: CompanyUser | null;

  @ManyToOne(() => LeaveApprovalDelegation, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'approval_delegation_id' })
  approval_delegation: LeaveApprovalDelegation | null;

  @ManyToOne(() => LeaveActingAssignment, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'replaced_by_assignment_id' })
  replaced_by: LeaveActingAssignment | null;

  @ManyToOne(() => LeaveRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_request_id' })
  leave_request: LeaveRequest;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'absent_employee_id' })
  absent_employee: Employee;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'acting_employee_id' })
  acting_employee: Employee;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'appointed_by_employee_id' })
  appointed_by_employee: Employee | null;
}
