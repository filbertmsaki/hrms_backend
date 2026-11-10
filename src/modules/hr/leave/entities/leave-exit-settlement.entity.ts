import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Leave balance settled at an employee's exit, per leave type. Positive
 * settlement days are paid out; negative days are recovered (leave taken
 * beyond what was earned). Handed to payroll via `status`.
 */
@Entity('leave_exit_settlements')
@Unique('UQ_leave_exit_settlement', [
  'company_id',
  'employee_id',
  'leave_type_id',
  'exit_date',
])
@Index('IDX_leave_exit_settlement_employee', ['company_id', 'employee_id'])
export class LeaveExitSettlement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column()
  leave_type_id: number;

  @Column({ type: 'int', nullable: true })
  offboarding_request_id: number | null;

  @Column({ type: 'date' })
  exit_date: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  earned_to_exit_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  carried_forward_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  adjusted_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  used_days: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  deducted_days: string;

  /** > 0 pay out, < 0 recover. */
  @Column({ type: 'decimal', precision: 8, scale: 2 })
  settlement_days: string;

  /** pending_payroll | processed | void */
  @Column({ type: 'varchar', length: 20, default: 'pending_payroll' })
  status: string;

  @Column({ type: 'json', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;
}
