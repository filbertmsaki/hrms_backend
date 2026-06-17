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
import { Shift } from '../../shifts/entities/shift.entity';

@Entity('shift_attendance_rules')
@Index('IDX_shift_attendance_rules_shift_id', ['shiftId'])
@Index('UQ_shift_attendance_rules_shift', ['shiftId'], { unique: true })
export class ShiftAttendanceRule {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'shift_id', type: 'int' })
  shiftId: number;

  @Column({ name: 'late_after_minutes', type: 'int', default: 0 })
  lateAfterMinutes: number;

  @Column({ name: 'absent_after_minutes', type: 'int', default: 0 })
  absentAfterMinutes: number;

  @Column({ name: 'half_day_after_minutes', type: 'int', default: 0 })
  halfDayAfterMinutes: number;

  @Column({ name: 'allow_multiple_checkin', type: 'boolean', default: false })
  allowMultipleCheckin: boolean;

  @Column({ name: 'auto_mark_absent', type: 'boolean', default: true })
  autoMarkAbsent: boolean;

  @Column({ name: 'allow_mobile_attendance', type: 'boolean', default: true })
  allowMobileAttendance: boolean;

  @Column({ name: 'allow_remote_attendance', type: 'boolean', default: false })
  allowRemoteAttendance: boolean;

  @Column({ name: 'require_geofence', type: 'boolean', default: false })
  requireGeofence: boolean;

  @Column({ name: 'require_biometric', type: 'boolean', default: false })
  requireBiometric: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Shift, (shift) => shift.attendanceRules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;
}
