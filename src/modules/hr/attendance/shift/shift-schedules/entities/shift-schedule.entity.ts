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
import { Company } from '../../../../../companies/entities/company.entity';
import { CompanyUser } from '../../../../../companies/entities/company-user.entity';
import { Employee } from '../../../../employees/entities/employee.entity';
import { Shift } from '../../shifts/entities/shift.entity';
import { AttendanceHoliday } from '../../../holidays/entities/holiday.entity';

@Entity('shift_schedules')
@Index('IDX_shift_schedules_company_id', ['companyId'])
@Index('IDX_shift_schedules_employee_id', ['employeeId'])
@Index('IDX_shift_schedules_shift_id', ['shiftId'])
@Index('IDX_shift_schedules_override_shift_id', ['overrideShiftId'])
@Index('IDX_shift_schedules_schedule_date', ['scheduleDate'])
@Index('IDX_shift_schedules_effective_from', ['effectiveFrom'])
@Index('IDX_shift_schedules_effective_to', ['effectiveTo'])
@Index('IDX_shift_schedules_company_employee_from', [
  'companyId',
  'employeeId',
  'effectiveFrom',
])
@Index('IDX_shift_schedules_holiday_id', ['holidayId'])
export class ShiftSchedule {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'shift_id', type: 'int', nullable: true })
  shiftId: number | null;

  @Column({ name: 'schedule_date', type: 'date' })
  scheduleDate: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'generated_from_rotation', type: 'boolean', default: false })
  generatedFromRotation: boolean;

  @Column({ name: 'override_shift_id', type: 'int', nullable: true })
  overrideShiftId: number | null;

  @Column({ name: 'holiday_id', type: 'int', nullable: true })
  holidayId: number | null;

  @Column({ name: 'is_off_day', type: 'boolean', default: false })
  isOffDay: boolean;

  @Column({ name: 'assigned_by', type: 'int', nullable: true })
  assignedBy: number | null;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => Shift, (shift) => shift.schedules, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift | null;

  @ManyToOne(() => Shift, (shift) => shift.overrideSchedules, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'override_shift_id' })
  overrideShift: Shift | null;

  @ManyToOne(() => AttendanceHoliday, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'holiday_id' })
  holiday: AttendanceHoliday | null;

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_by' })
  assignedByUser: CompanyUser | null;
}
