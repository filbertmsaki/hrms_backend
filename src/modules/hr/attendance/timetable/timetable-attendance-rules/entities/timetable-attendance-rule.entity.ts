import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Timetable } from '../../timetables/entities/timetable.entity';

@Entity('timetable_attendance_rules')
@Index('IDX_timetable_attendance_rules_timetable_id', ['timetableId'])
@Index('UQ_timetable_attendance_rules_timetable', ['timetableId'], { unique: true })
export class TimetableAttendanceRule {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'timetable_id', type: 'int' })
  timetableId: number;

  @Column({ name: 'late_after_minutes', type: 'int', default: 0 })
  lateAfterMinutes: number;

  @Column({ name: 'half_day_after_minutes', type: 'int', default: 0 })
  halfDayAfterMinutes: number;

  @Column({ name: 'absent_after_minutes', type: 'int', default: 0 })
  absentAfterMinutes: number;

  @Column({ name: 'allow_early_checkin', type: 'boolean', default: true })
  allowEarlyCheckin: boolean;

  @Column({ name: 'allow_late_checkout', type: 'boolean', default: true })
  allowLateCheckout: boolean;

  @Column({ name: 'auto_absent_if_no_checkin', type: 'boolean', default: true })
  autoAbsentIfNoCheckin: boolean;

  @Column({ name: 'max_overtime_minutes', type: 'int', default: 0 })
  maxOvertimeMinutes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Timetable, (timetable) => timetable.attendanceRules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timetable_id' })
  timetable: Timetable;
}
