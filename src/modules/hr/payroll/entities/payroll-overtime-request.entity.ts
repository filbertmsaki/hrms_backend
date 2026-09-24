import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PayrollOvertimeRequestStatus =
  | 'PENDING_MANAGER'
  | 'PENDING_HR'
  | 'APPROVED'
  | 'REJECTED';

@Entity('payroll_overtime_requests')
@Index('IDX_payroll_overtime_request_company_status', ['companyId', 'status'])
@Index('IDX_payroll_overtime_request_manager_status', [
  'companyId',
  'managerEmployeeId',
  'status',
])
export class PayrollOvertimeRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id' })
  companyId: number;

  @Column({ name: 'employee_id' })
  employeeId: number;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'work_date', type: 'date' })
  workDate: string;

  @Column({ name: 'requested_minutes', type: 'int' })
  requestedMinutes: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 30, default: 'PENDING_MANAGER' })
  status: PayrollOvertimeRequestStatus;

  @Column({ name: 'manager_comments', type: 'text', nullable: true })
  managerComments: string | null;

  @Column({
    name: 'manager_decided_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  managerDecidedByCompanyUserId: number | null;

  @Column({ name: 'manager_decided_at', type: 'timestamptz', nullable: true })
  managerDecidedAt: Date | null;

  @Column({ name: 'hr_comments', type: 'text', nullable: true })
  hrComments: string | null;

  @Column({
    name: 'hr_decided_by_company_user_id',
    type: 'int',
    nullable: true,
  })
  hrDecidedByCompanyUserId: number | null;

  @Column({ name: 'hr_decided_at', type: 'timestamptz', nullable: true })
  hrDecidedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
