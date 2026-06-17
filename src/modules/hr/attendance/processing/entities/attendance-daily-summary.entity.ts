import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';
import { Branch } from '../../../branches/entities/branch.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { Shift } from '../../shift/shifts/entities/shift.entity';
import { Timetable } from '../../timetable/timetables/entities/timetable.entity';
import { HikvisionAttendanceLog } from '../../../../hikvision/entities/hikvision-attendance-log.entity';
import { CompanyUser } from '../../../../companies/entities/company-user.entity';
import { AttendanceDailyRemarkEnum } from '../enums/attendance-daily-remark.enum';

@Entity('attendance_daily_summaries')
@Index('IDX_attendance_daily_summaries_company_id', ['companyId'])
@Index('IDX_attendance_daily_summaries_branch_id', ['branchId'])
@Index('IDX_attendance_daily_summaries_employee_id', ['employeeId'])
@Index('IDX_attendance_daily_summaries_attendance_date', ['attendanceDate'])
@Index('IDX_attendance_daily_summaries_status', ['attendanceStatus'])
@Unique('UQ_attendance_daily_summaries_company_employee_date', [
  'companyId',
  'employeeId',
  'attendanceDate',
])
export class AttendanceDailySummary {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ name: 'schedule_source', type: 'varchar', length: 50 })
  scheduleSource: string;

  @Column({ name: 'shift_id', type: 'int', nullable: true })
  shiftId: number | null;

  @Column({ name: 'timetable_id', type: 'int', nullable: true })
  timetableId: number | null;

  @Column({ name: 'timezone', type: 'varchar', length: 100, default: 'UTC' })
  timezone: string;

  @Column({ name: 'schedule_start_at', type: 'timestamp', nullable: true })
  scheduleStartAt: Date | null;

  @Column({ name: 'schedule_end_at', type: 'timestamp', nullable: true })
  scheduleEndAt: Date | null;

  @Column({ name: 'check_in_at', type: 'timestamp', nullable: true })
  checkInAt: Date | null;

  @Column({ name: 'check_out_at', type: 'timestamp', nullable: true })
  checkOutAt: Date | null;

  @Column({ name: 'late_minutes', type: 'int', default: 0 })
  lateMinutes: number;

  @Column({ name: 'early_departure_minutes', type: 'int', default: 0 })
  earlyDepartureMinutes: number;

  @Column({ name: 'work_minutes', type: 'int', default: 0 })
  workMinutes: number;

  @Column({ name: 'break_minutes', type: 'int', default: 0 })
  breakMinutes: number;

  @Column({ name: 'overtime_minutes', type: 'int', default: 0 })
  overtimeMinutes: number;

  @Column({ name: 'attendance_status', type: 'varchar', length: 50 })
  attendanceStatus: string;

  @Column({ name: 'remarks', type: 'json', nullable: true })
  remarks: AttendanceDailyRemarkEnum[] | null;

  @Column({ name: 'flags', type: 'json', nullable: true })
  flags: Record<string, unknown> | null;

  @Column({ name: 'source_first_raw_log_id', type: 'int', nullable: true })
  sourceFirstRawLogId: number | null;

  @Column({ name: 'source_last_raw_log_id', type: 'int', nullable: true })
  sourceLastRawLogId: number | null;

  @Column({ name: 'calculation_version', type: 'int', default: 1 })
  calculationVersion: number;

  @Column({ name: 'is_adjusted', type: 'boolean', default: false })
  isAdjusted: boolean;

  @Column({ name: 'adjusted_by_company_user_id', type: 'int', nullable: true })
  adjustedByCompanyUserId: number | null;

  @Column({ name: 'adjusted_at', type: 'timestamp', nullable: true })
  adjustedAt: Date | null;

  @Column({ name: 'finalized_at', type: 'timestamp', nullable: true })
  finalizedAt: Date | null;

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

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => Shift, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift | null;

  @ManyToOne(() => Timetable, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'timetable_id' })
  timetable: Timetable | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'adjusted_by_company_user_id' })
  adjustedByCompanyUser: CompanyUser | null;

  @ManyToOne(() => HikvisionAttendanceLog, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'source_first_raw_log_id' })
  sourceFirstRawLog: HikvisionAttendanceLog | null;

  @ManyToOne(() => HikvisionAttendanceLog, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'source_last_raw_log_id' })
  sourceLastRawLog: HikvisionAttendanceLog | null;
}
