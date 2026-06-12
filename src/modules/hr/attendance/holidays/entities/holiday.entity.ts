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
import { Branch } from '../../../branches/entities/branch.entity';
import { AttendanceHolidayTypeEnum } from '../enums/attendance-holiday-type.enum';
import { HolidayGroup } from './holiday-group.entity';

@Entity('attendance_holidays')
@Index('IDX_attendance_holidays_company_id', ['companyId'])
@Index('IDX_attendance_holidays_holiday_group_id', ['holidayGroupId'])
@Index('IDX_attendance_holidays_date', ['date'])
@Index('IDX_attendance_holidays_type', ['type'])
@Index('IDX_attendance_holidays_branch_id', ['branchId'])
@Index('IDX_attendance_holidays_company_date_branch', ['companyId', 'date', 'branchId'])
@Index('UQ_attendance_holidays_group_name_date', ['holidayGroupId', 'name', 'date'], {
  unique: true,
})
export class AttendanceHoliday {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'holiday_group_id', type: 'int' })
  holidayGroupId: number;

  @Column({ name: 'name', type: 'varchar', length: 200 })
  name: string;

  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({
    name: 'type',
    type: 'enum',
    enum: AttendanceHolidayTypeEnum,
  })
  type: AttendanceHolidayTypeEnum;

  @Column({ name: 'is_paid', type: 'boolean', default: true })
  isPaid: boolean;

  @Column({ name: 'affects_overtime', type: 'boolean', default: false })
  affectsOvertime: boolean;

  @Column({ name: 'counts_as_working_day', type: 'boolean', default: false })
  countsAsWorkingDay: boolean;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => HolidayGroup, (holidayGroup) => holidayGroup.holidays, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'holiday_group_id' })
  holidayGroup: HolidayGroup;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;
}




