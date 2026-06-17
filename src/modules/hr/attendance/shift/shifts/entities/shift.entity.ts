import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../../../companies/entities/company.entity';
import { CompanyUser } from '../../../../../companies/entities/company-user.entity';
import { Branch } from '../../../../branches/entities/branch.entity';
import { Department } from '../../../../departments/entities/department.entity';
import { ShiftTypeEnum } from '../enums/shift-type.enum';
import { ShiftStatusEnum } from '../enums/shift-status.enum';
import { ShiftBreak } from '../../shift-breaks/entities/shift-break.entity';
import { ShiftOvertimeRule } from '../../shift-overtime-rules/entities/shift-overtime-rule.entity';
import { ShiftAttendanceRule } from '../../shift-attendance-rules/entities/shift-attendance-rule.entity';
import { ShiftAssignment } from '../../shift-assignments/entities/shift-assignment.entity';
import { ShiftRotationRule } from '../../shift-rotation-rules/entities/shift-rotation-rule.entity';
import { ShiftSchedule } from '../../shift-schedules/entities/shift-schedule.entity';

@Entity('shifts')
@Index('IDX_shifts_company_id', ['companyId'])
@Index('IDX_shifts_branch_id', ['branchId'])
@Index('IDX_shifts_department_id', ['departmentId'])
@Index('IDX_shifts_status', ['status'])
@Index('UQ_shifts_company_code', ['companyId', 'code'], { unique: true })
@Index('UQ_shifts_company_name', ['companyId', 'name'], { unique: true })
export class Shift {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'code', type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'shift_type', type: 'enum', enum: ShiftTypeEnum })
  shiftType: ShiftTypeEnum;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'expected_work_minutes', type: 'int', default: 0 })
  expectedWorkMinutes: number;

  @Column({ name: 'minimum_work_minutes', type: 'int', default: 0 })
  minimumWorkMinutes: number;

  @Column({ name: 'half_day_minutes', type: 'int', default: 0 })
  halfDayMinutes: number;

  @Column({ name: 'grace_in_minutes', type: 'int', default: 0 })
  graceInMinutes: number;

  @Column({ name: 'grace_out_minutes', type: 'int', default: 0 })
  graceOutMinutes: number;

  @Column({ name: 'late_after_minutes', type: 'int', default: 0 })
  lateAfterMinutes: number;

  @Column({ name: 'early_leave_after_minutes', type: 'int', default: 0 })
  earlyLeaveAfterMinutes: number;

  @Column({ name: 'is_night_shift', type: 'boolean', default: false })
  isNightShift: boolean;

  @Column({ name: 'crosses_midnight', type: 'boolean', default: false })
  crossesMidnight: boolean;

  @Column({ name: 'allow_overtime', type: 'boolean', default: false })
  allowOvertime: boolean;

  @Column({ name: 'max_overtime_minutes', type: 'int', default: 0 })
  maxOvertimeMinutes: number;

  @Column({ name: 'requires_checkout', type: 'boolean', default: true })
  requiresCheckout: boolean;

  @Column({ name: 'allow_early_checkin', type: 'boolean', default: true })
  allowEarlyCheckin: boolean;

  @Column({ name: 'allow_late_checkout', type: 'boolean', default: true })
  allowLateCheckout: boolean;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ShiftStatusEnum,
    default: ShiftStatusEnum.ACTIVE,
  })
  status: ShiftStatusEnum;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: CompanyUser | null;

  @OneToMany(() => ShiftBreak, (shiftBreak) => shiftBreak.shift)
  breaks: ShiftBreak[];

  @OneToMany(() => ShiftOvertimeRule, (overtimeRule) => overtimeRule.shift)
  overtimeRules: ShiftOvertimeRule[];

  @OneToMany(
    () => ShiftAttendanceRule,
    (attendanceRule) => attendanceRule.shift,
  )
  attendanceRules: ShiftAttendanceRule[];

  @OneToMany(() => ShiftAssignment, (assignment) => assignment.shift)
  assignments: ShiftAssignment[];

  @OneToMany(() => ShiftRotationRule, (rotationRule) => rotationRule.shift)
  rotationRules: ShiftRotationRule[];

  @OneToMany(() => ShiftSchedule, (schedule) => schedule.shift)
  schedules: ShiftSchedule[];

  @OneToMany(() => ShiftSchedule, (schedule) => schedule.overrideShift)
  overrideSchedules: ShiftSchedule[];
}
