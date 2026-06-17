import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';
import { CompanyUser } from '../../../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../../../access-control/attendance-devices/entities/attendance-device.entity';
import { HikvisionAttendanceLog } from '../../../../hikvision/entities/hikvision-attendance-log.entity';
import { Branch } from '../../../branches/entities/branch.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { AttendanceDailySummary } from './attendance-daily-summary.entity';
import { AttendanceProcessedEvent } from './attendance-processed-event.entity';
import { AttendanceExceptionStatusEnum } from '../enums/attendance-exception-status.enum';
import { AttendanceExceptionTypeEnum } from '../enums/attendance-exception-type.enum';

@Entity('attendance_processing_exceptions')
@Index('IDX_attendance_processing_exceptions_company_id', ['companyId'])
@Index('IDX_attendance_processing_exceptions_branch_id', ['branchId'])
@Index('IDX_attendance_processing_exceptions_employee_id', ['employeeId'])
@Index('IDX_attendance_processing_exceptions_raw_log_id', ['rawLogId'])
@Index('IDX_attendance_processing_exceptions_processed_event_id', [
  'processedEventId',
])
@Index('IDX_attendance_processing_exceptions_summary_id', ['summaryId'])
@Index('IDX_attendance_processing_exceptions_device_id', ['deviceId'])
@Index('IDX_attendance_processing_exceptions_attendance_date', [
  'attendanceDate',
])
@Index('IDX_attendance_processing_exceptions_type', ['exceptionType'])
@Index('IDX_attendance_processing_exceptions_status', ['status'])
export class AttendanceProcessingException {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'raw_log_id', type: 'int', nullable: true })
  rawLogId: number | null;

  @Column({ name: 'processed_event_id', type: 'int', nullable: true })
  processedEventId: number | null;

  @Column({ name: 'summary_id', type: 'int', nullable: true })
  summaryId: number | null;

  @Column({ name: 'device_id', type: 'int', nullable: true })
  deviceId: number | null;

  @Column({ name: 'employee_no', type: 'varchar', length: 100, default: '' })
  employeeNo: string;

  @Column({ name: 'attendance_date', type: 'date', nullable: true })
  attendanceDate: string | null;

  @Column({
    name: 'exception_type',
    type: 'enum',
    enum: AttendanceExceptionTypeEnum,
  })
  exceptionType: AttendanceExceptionTypeEnum;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceExceptionStatusEnum,
    default: AttendanceExceptionStatusEnum.OPEN,
  })
  status: AttendanceExceptionStatusEnum;

  @Column({ name: 'message', type: 'varchar', length: 255, nullable: true })
  message: string | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'is_system_generated', type: 'boolean', default: true })
  isSystemGenerated: boolean;

  @Column({ name: 'resolved_by_company_user_id', type: 'int', nullable: true })
  resolvedByCompanyUserId: number | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote: string | null;

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

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee | null;

  @ManyToOne(() => HikvisionAttendanceLog, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'raw_log_id' })
  rawLog: HikvisionAttendanceLog | null;

  @ManyToOne(() => AttendanceProcessedEvent, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'processed_event_id' })
  processedEvent: AttendanceProcessedEvent | null;

  @ManyToOne(() => AttendanceDailySummary, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'summary_id' })
  summary: AttendanceDailySummary | null;

  @ManyToOne(() => AttendanceDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'device_id' })
  device: AttendanceDevice | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by_company_user_id' })
  resolvedByCompanyUser: CompanyUser | null;
}
