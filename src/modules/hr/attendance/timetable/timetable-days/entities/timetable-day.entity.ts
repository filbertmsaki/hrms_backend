import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Timetable } from '../../timetables/entities/timetable.entity';
import { TimetableShiftRule } from '../../timetable-shift-rules/entities/timetable-shift-rule.entity';
import { Shift } from '../../../shift/shifts/entities/shift.entity';

@Entity('timetable_days')
@Index('IDX_timetable_days_timetable_id', ['timetableId'])
@Index('IDX_timetable_days_default_shift_id', ['defaultShiftId'])
@Index('UQ_timetable_days_timetable_day', ['timetableId', 'dayOfWeek'], { unique: true })
export class TimetableDay {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'timetable_id', type: 'int' })
  timetableId: number;

  @Column({ name: 'day_of_week', type: 'tinyint' })
  dayOfWeek: number;

  @Column({ name: 'is_working_day', type: 'boolean', default: true })
  isWorkingDay: boolean;

  @Column({ name: 'default_shift_id', type: 'int', nullable: true })
  defaultShiftId: number | null;

  @Column({ name: 'minimum_work_minutes', type: 'int', default: 0 })
  minimumWorkMinutes: number;

  @Column({ name: 'expected_check_in_time', type: 'time', nullable: true })
  expectedCheckInTime: string | null;

  @Column({ name: 'expected_check_out_time', type: 'time', nullable: true })
  expectedCheckOutTime: string | null;

  @Column({ name: 'allow_flexible_time', type: 'boolean', default: false })
  allowFlexibleTime: boolean;

  @Column({ name: 'flexible_start_from', type: 'time', nullable: true })
  flexibleStartFrom: string | null;

  @Column({ name: 'flexible_start_to', type: 'time', nullable: true })
  flexibleStartTo: string | null;

  @Column({ name: 'overtime_allowed', type: 'boolean', default: false })
  overtimeAllowed: boolean;

  @Column({ name: 'break_required', type: 'boolean', default: false })
  breakRequired: boolean;

  @Column({ name: 'break_minutes', type: 'int', default: 0 })
  breakMinutes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Timetable, (timetable) => timetable.days, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timetable_id' })
  timetable: Timetable;

  @ManyToOne(() => Shift, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'default_shift_id' })
  defaultShift: Shift | null;

  @OneToMany(() => TimetableShiftRule, (shiftRule) => shiftRule.timetableDay)
  shiftRules: TimetableShiftRule[];
}
