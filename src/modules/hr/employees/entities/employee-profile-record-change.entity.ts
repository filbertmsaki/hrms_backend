import {
  Check,
  Column,
  JoinColumn,
  ManyToOne,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { User } from '../../../users/entities/user.entity';
import { Employee } from './employee.entity';

export const PROFILE_RECORD_TYPES = [
  'contact',
  'address',
  'relative',
  'identification',
  'bank_account',
  'academic_qualification',
  'professional_qualification',
  'experience',
] as const;
export type ProfileRecordType = (typeof PROFILE_RECORD_TYPES)[number];

/** Records whose create/edit/delete must be approved by HR first. */
export const SENSITIVE_PROFILE_RECORD_TYPES: readonly ProfileRecordType[] = [
  'relative',
  'identification',
  'bank_account',
];

export type ProfileRecordChangeAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ROLLBACK';
export type ProfileRecordChangeStatus =
  | 'PENDING_HR'
  | 'APPLIED'
  | 'REJECTED'
  | 'CANCELLED';

/**
 * Append-mostly audit + request log for an employee's own profile records.
 * Non-sensitive changes are written as APPLIED immediately; sensitive changes
 * and every rollback wait in PENDING_HR. Snapshots are JSON, encrypted for
 * sensitive record types when field encryption is configured.
 */
@Entity('employee_profile_record_changes')
@Check('CHK_eprc_action', "action IN ('CREATE','UPDATE','DELETE','ROLLBACK')")
@Check(
  'CHK_eprc_status',
  "status IN ('PENDING_HR','APPLIED','REJECTED','CANCELLED')",
)
@Index('IDX_eprc_company_status', ['company_id', 'status'])
@Index('IDX_eprc_employee_record', ['employee_id', 'record_type', 'record_id'])
export class EmployeeProfileRecordChange {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'int' })
  employee_id: number;

  @Column({ type: 'varchar', length: 40 })
  record_type: ProfileRecordType;

  /** Null for a pending CREATE; set once the record exists. */
  @Column({ type: 'int', nullable: true })
  record_id: number | null;

  @Column({ type: 'varchar', length: 20 })
  action: ProfileRecordChangeAction;

  @Column({ type: 'varchar', length: 20 })
  status: ProfileRecordChangeStatus;

  @Column({ default: false })
  sensitive: boolean;

  /** Requested values (CREATE/UPDATE). */
  @Column({ type: 'text', nullable: true })
  payload: string | null;

  @Column({ type: 'text', nullable: true })
  before_data: string | null;

  @Column({ type: 'text', nullable: true })
  after_data: string | null;

  @Column({ type: 'int', nullable: true })
  rollback_of_change_id: number | null;

  @Column({ type: 'int', nullable: true })
  rolled_back_by_change_id: number | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'int' })
  requested_by_user_id: number;

  @Column({ type: 'int', nullable: true })
  reviewed_by_user_id: number | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  review_comment: string | null;

  @Column({ type: 'timestamp', nullable: true })
  applied_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company?: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee?: Employee;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by_user_id' })
  requested_by_user?: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_user_id' })
  reviewed_by_user?: User | null;

  @ManyToOne(() => EmployeeProfileRecordChange, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'rollback_of_change_id' })
  rollback_of_change?: EmployeeProfileRecordChange | null;

  @ManyToOne(() => EmployeeProfileRecordChange, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rolled_back_by_change_id' })
  rolled_back_by_change?: EmployeeProfileRecordChange | null;
}
