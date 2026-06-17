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
import { Branch } from '../../../../branches/entities/branch.entity';
import { CompanyUser } from '../../../../../companies/entities/company-user.entity';
import { TimetableTypeEnum } from '../enums/timetable-type.enum';
import { TimetableStatusEnum } from '../enums/timetable-status.enum';
import { TimetableDay } from '../../timetable-days/entities/timetable-day.entity';
import { EmployeeTimetable } from '../../employee-timetables/entities/employee-timetable.entity';
import { TimetableRotation } from '../../timetable-rotations/entities/timetable-rotation.entity';
import { TimetableHolidayRule } from '../../timetable-holiday-rules/entities/timetable-holiday-rule.entity';
import { TimetableAttendanceRule } from '../../timetable-attendance-rules/entities/timetable-attendance-rule.entity';
import { TimetableGeneratedSchedule } from '../../timetable-generated-schedules/entities/timetable-generated-schedule.entity';

@Entity('timetables')
@Index('IDX_timetables_company_id', ['companyId'])
@Index('IDX_timetables_branch_id', ['branchId'])
@Index('IDX_timetables_status', ['status'])
@Index('IDX_timetables_default', ['companyId', 'isDefault'])
@Index('UQ_timetables_company_code', ['companyId', 'code'], { unique: true })
@Index('UQ_timetables_company_name', ['companyId', 'name'], { unique: true })
export class Timetable {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'code', type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'timetable_type',
    type: 'enum',
    enum: TimetableTypeEnum,
  })
  timetableType: TimetableTypeEnum;

  @Column({ name: 'timezone', type: 'varchar', length: 100 })
  timezone: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({
    name: 'status',
    type: 'enum',
    enum: TimetableStatusEnum,
    default: TimetableStatusEnum.ACTIVE,
  })
  status: TimetableStatusEnum;

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

  @ManyToOne(() => CompanyUser, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator: CompanyUser | null;

  @OneToMany(() => TimetableDay, (day) => day.timetable)
  days: TimetableDay[];

  @OneToMany(
    () => EmployeeTimetable,
    (employeeTimetable) => employeeTimetable.timetable,
  )
  employeeTimetables: EmployeeTimetable[];

  @OneToMany(() => TimetableRotation, (rotation) => rotation.timetable)
  rotations: TimetableRotation[];

  @OneToMany(() => TimetableHolidayRule, (holidayRule) => holidayRule.timetable)
  holidayRules: TimetableHolidayRule[];

  @OneToMany(
    () => TimetableAttendanceRule,
    (attendanceRule) => attendanceRule.timetable,
  )
  attendanceRules: TimetableAttendanceRule[];

  @OneToMany(() => TimetableGeneratedSchedule, (schedule) => schedule.timetable)
  generatedSchedules: TimetableGeneratedSchedule[];
}
