import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../companies/entities/company.entity';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { LeaveAuditLog } from './leave-audit-log.entity';
import { LeaveDocument } from './leave-document.entity';
import { LeaveMedicalDetail } from './leave-medical-detail.entity';
import { LeaveRequestApproval } from './leave-request-approval.entity';
import { LeaveType } from './leave-type.entity';

@Entity('leave_requests')
@Unique('UQ_leave_request_company_no', ['company_id', 'leave_no'])
@Index('IDX_leave_request_company', ['company_id'])
@Index('IDX_leave_request_employee', ['employee_id'])
@Index('IDX_leave_request_type', ['leave_type_id'])
@Index('IDX_leave_request_status', ['status'])
@Index('IDX_leave_request_period', ['start_date', 'end_date'])
export class LeaveRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  employee_id: number;

  @Column()
  leave_type_id: number;

  @Column({ length: 50 })
  leave_no: string;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date' })
  end_date: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  total_days: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'int', default: 0 })
  current_approval_level: number;

  @Column({
    type: 'enum',
    enum: LeaveStatusEnum,
    default: LeaveStatusEnum.DRAFT,
  })
  status: LeaveStatusEnum;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  applied_at: Date | null;

  @Column({ type: 'int' })
  created_by_company_user_id: number;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelled_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => LeaveType, (leaveType) => leaveType.leave_requests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'leave_type_id' })
  leave_type: LeaveType;

  @ManyToOne(() => CompanyUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_company_user_id' })
  created_by_company_user: CompanyUser;

  @OneToMany(
    () => LeaveRequestApproval,
    (leaveRequestApproval) => leaveRequestApproval.leave_request,
    {
      cascade: true,
    },
  )
  approvals: LeaveRequestApproval[];

  @OneToOne(
    () => LeaveMedicalDetail,
    (leaveMedicalDetail) => leaveMedicalDetail.leave_request,
    {
      cascade: true,
    },
  )
  medical_detail: LeaveMedicalDetail | null;

  @OneToMany(
    () => LeaveDocument,
    (leaveDocument) => leaveDocument.leave_request,
    {
      cascade: true,
    },
  )
  documents: LeaveDocument[];

  @OneToMany(
    () => LeaveAuditLog,
    (leaveAuditLog) => leaveAuditLog.leave_request,
  )
  audit_logs: LeaveAuditLog[];
}
