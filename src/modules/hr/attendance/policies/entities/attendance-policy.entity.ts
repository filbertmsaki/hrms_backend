import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';
import { AttendanceCheckpoint } from '../../checkpoints/entities/attendance-checkpoint.entity';
import { AttendanceHolidayPolicyModeEnum } from '../enums/attendance-holiday-policy-mode.enum';
import { AttendanceRoundingModeEnum } from '../enums/attendance-rounding-mode.enum';

@Entity('attendance_policies')
@Index('IDX_attendance_policy_company', ['company_id'])
@Index('IDX_attendance_policy_company_active', ['company_id', 'is_active'])
@Index('UQ_attendance_policy_company_name', ['company_id', 'name'], {
  unique: true,
})
export class AttendancePolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ default: false })
  is_active: boolean;

  @Column({ type: 'int', default: 10 })
  late_after_minutes: number;

  @Column({ type: 'int', default: 240 })
  half_day_after_minutes: number;

  @Column({ type: 'int', default: 480 })
  absent_after_minutes: number;

  @Column({ default: true })
  allow_early_checkin: boolean;

  @Column({ default: true })
  allow_late_checkout: boolean;

  @Column({ default: true })
  auto_absent_if_no_checkin: boolean;

  @Column({ default: false })
  requires_manager_approval_for_overtime: boolean;

  @Column({
    type: 'enum',
    enum: AttendanceRoundingModeEnum,
    default: AttendanceRoundingModeEnum.NEAREST,
  })
  rounding_mode: AttendanceRoundingModeEnum;

  @Column({ type: 'int', default: 0 })
  max_missing_punch_allowed: number;

  @Column({ type: 'varchar', length: 100, default: 'SAT,SUN' })
  weekend_days: string;

  @Column({ default: true })
  auto_mark_weekend_as_off: boolean;

  @Column({ default: false })
  treat_weekend_as_absent_if_scheduled: boolean;

  @Column({
    type: 'enum',
    enum: AttendanceHolidayPolicyModeEnum,
    default: AttendanceHolidayPolicyModeEnum.OFF,
  })
  holiday_policy_mode: AttendanceHolidayPolicyModeEnum;

  @Column({ type: 'varchar', length: 120, default: 'MOBILE_APP,WEB' })
  authentication_modes: string;

  @Column({ default: false })
  require_geo_fencing: boolean;

  @Column({ default: false })
  allow_multi_device_login: boolean;

  @Column({ default: true })
  auto_calculate_attendance: boolean;

  @Column({ type: 'time', default: '23:59:00' })
  calculation_time: string;

  @Column({ type: 'int', default: 10 })
  grace_period_minutes: number;

  @Column({ default: true })
  consider_shift_roster: boolean;

  @Column({ default: true })
  ignore_missing_checkout_if_hours_valid: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => AttendanceCheckpoint, (checkpoint) => checkpoint.policySet)
  checkpoints: AttendanceCheckpoint[];
}
