import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LeaveApproverTypeEnum } from '../enums/leave-approver-type.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';

/**
 * HR-configured condition that adds a management approval after HR.
 * Every condition that is set must match (AND); empty conditions are ignored.
 * A request needs management approval when any active rule matches.
 */
@Entity('leave_management_approval_rules')
@Index('IDX_leave_management_rule_company', ['company_id', 'status'])
export class LeaveManagementApprovalRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: LeaveRecordStatusEnum.ACTIVE,
  })
  status: LeaveRecordStatusEnum;

  /** Leave types that need management approval; null = any type. */
  @Column({ type: 'json', nullable: true })
  leave_type_ids: number[] | null;

  /** Applies when the request is at least this many days. */
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  min_total_days: string | null;

  /** Applicant's primary position. */
  @Column({ type: 'json', nullable: true })
  position_ids: number[] | null;

  /** Applicant's grade (organizational level). */
  @Column({ type: 'json', nullable: true })
  grade_ids: number[] | null;

  /** Applicant's primary department. */
  @Column({ type: 'json', nullable: true })
  department_ids: number[] | null;

  @Column({ type: 'varchar', length: 20 })
  approver_type: LeaveApproverTypeEnum;

  @Column({ type: 'int', nullable: true })
  role_id: number | null;

  @Column({ type: 'int', nullable: true })
  position_id: number | null;

  @Column({ type: 'int', nullable: true })
  company_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  created_by_company_user_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
