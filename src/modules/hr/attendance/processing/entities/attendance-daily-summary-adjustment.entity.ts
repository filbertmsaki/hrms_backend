import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';
import { CompanyUser } from '../../../../companies/entities/company-user.entity';
import { Employee } from '../../../employees/entities/employee.entity';
import { AttendanceDailySummary } from './attendance-daily-summary.entity';

@Entity('attendance_daily_summary_adjustments')
@Index('IDX_attendance_daily_summary_adjustments_company_id', ['companyId'])
@Index('IDX_attendance_daily_summary_adjustments_employee_id', ['employeeId'])
@Index('IDX_attendance_daily_summary_adjustments_attendance_date', ['attendanceDate'])
@Index('IDX_attendance_daily_summary_adjustments_is_active', ['isActive'])
export class AttendanceDailySummaryAdjustment {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'summary_id', type: 'int', nullable: true })
  summaryId: number | null;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ name: 'status_override', type: 'varchar', length: 50, nullable: true })
  statusOverride: string | null;

  @Column({ name: 'check_in_at_override', type: 'timestamp', nullable: true })
  checkInAtOverride: Date | null;

  @Column({ name: 'check_out_at_override', type: 'timestamp', nullable: true })
  checkOutAtOverride: Date | null;

  @Column({ name: 'break_minutes_override', type: 'int', nullable: true })
  breakMinutesOverride: number | null;

  @Column({ name: 'work_minutes_override', type: 'int', nullable: true })
  workMinutesOverride: number | null;

  @Column({ name: 'late_minutes_override', type: 'int', nullable: true })
  lateMinutesOverride: number | null;

  @Column({ name: 'early_departure_minutes_override', type: 'int', nullable: true })
  earlyDepartureMinutesOverride: number | null;

  @Column({ name: 'overtime_minutes_override', type: 'int', nullable: true })
  overtimeMinutesOverride: number | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'applied_by_company_user_id', type: 'int', nullable: true })
  appliedByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'applied_at' })
  appliedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => AttendanceDailySummary, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'summary_id' })
  summary: AttendanceDailySummary | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'applied_by_company_user_id' })
  appliedByCompanyUser: CompanyUser | null;
}
