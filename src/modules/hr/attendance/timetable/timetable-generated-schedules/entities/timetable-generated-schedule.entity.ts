import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from '../../../../../companies/entities/company.entity';
import { Employee } from '../../../../employees/entities/employee.entity';
import { Timetable } from '../../timetables/entities/timetable.entity';
import { AttendanceHoliday } from '../../../holidays/entities/holiday.entity';
import { TimetableGeneratedScheduleSourceRuleEnum } from '../enums/timetable-generated-schedule-source-rule.enum';
import { Shift } from '../../../shift/shifts/entities/shift.entity';

@Entity('timetable_generated_schedules')
@Index('IDX_timetable_generated_schedules_company_id', ['companyId'])
@Index('IDX_timetable_generated_schedules_employee_id', ['employeeId'])
@Index('IDX_timetable_generated_schedules_timetable_id', ['timetableId'])
@Index('IDX_timetable_generated_schedules_shift_id', ['shiftId'])
@Index('IDX_timetable_generated_schedules_schedule_date', ['scheduleDate'])
@Index('IDX_timetable_generated_schedules_holiday_id', ['holidayId'])
@Index(
  'UQ_timetable_generated_schedules_company_employee_date',
  ['companyId', 'employeeId', 'scheduleDate'],
  {
    unique: true,
  },
)
export class TimetableGeneratedSchedule {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'timetable_id', type: 'int' })
  timetableId: number;

  @Column({ name: 'shift_id', type: 'int', nullable: true })
  shiftId: number | null;

  @Column({ name: 'schedule_date', type: 'date' })
  scheduleDate: string;

  @Column({ name: 'generated_from_rotation', type: 'boolean', default: false })
  generatedFromRotation: boolean;

  @Column({ name: 'is_off_day', type: 'boolean', default: false })
  isOffDay: boolean;

  @Column({ name: 'holiday_id', type: 'int', nullable: true })
  holidayId: number | null;

  @Column({
    name: 'source_rule',
    type: 'enum',
    enum: TimetableGeneratedScheduleSourceRuleEnum,
    default: TimetableGeneratedScheduleSourceRuleEnum.DAY,
  })
  sourceRule: TimetableGeneratedScheduleSourceRuleEnum;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => Timetable, (timetable) => timetable.generatedSchedules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'timetable_id' })
  timetable: Timetable;

  @ManyToOne(() => Shift, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift | null;

  @ManyToOne(() => AttendanceHoliday, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'holiday_id' })
  holiday: AttendanceHoliday | null;
}
