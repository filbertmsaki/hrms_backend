import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('employee_work_schedules')
@Index(
  'UQ_employee_work_schedule_company_employee_date',
  ['companyId', 'employeeId', 'scheduleDate'],
  { unique: true },
)
@Index('IDX_employee_work_schedule_publish_lookup', [
  'companyId',
  'employeeId',
  'scheduleDate',
  'status',
])
export class EmployeeWorkSchedule {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'company_id', type: 'int' }) companyId: number;
  @Column({ name: 'employee_id', type: 'int' }) employeeId: number;
  @Column({ name: 'schedule_date', type: 'date' }) scheduleDate: string;
  @Column({ name: 'shift_id', type: 'int', nullable: true }) shiftId:
    | number
    | null;
  @Column({ name: 'timetable_id', type: 'int', nullable: true }) timetableId:
    | number
    | null;
  @Column({
    name: 'timetable_day_shift_option_id',
    type: 'int',
    nullable: true,
  })
  timetableDayShiftOptionId: number | null;
  @Column({ name: 'is_off_day', type: 'boolean', default: false })
  isOffDay: boolean;
  @Column({ type: 'varchar', length: 16, default: 'DRAFT' }) status:
    | 'DRAFT'
    | 'PUBLISHED';
  @Column({ type: 'varchar', length: 32, default: 'MANUAL' }) source: string;
  @Column({ name: 'assigned_by', type: 'int', nullable: true }) assignedBy:
    | number
    | null;
  @Column({ name: 'published_by', type: 'int', nullable: true }) publishedBy:
    | number
    | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
  @Column({ type: 'text', nullable: true }) remarks: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
