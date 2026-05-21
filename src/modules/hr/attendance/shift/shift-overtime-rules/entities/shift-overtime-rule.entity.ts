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

@Entity('shift_overtime_rules')
@Index('IDX_shift_overtime_rules_shift_id', ['shiftId'])
@Index('UQ_shift_overtime_rules_shift', ['shiftId'], { unique: true })
export class ShiftOvertimeRule {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'shift_id', type: 'int' })
  shiftId: number;

  @Column({ name: 'overtime_start_after_minutes', type: 'int', default: 0 })
  overtimeStartAfterMinutes: number;

  @Column({ name: 'max_daily_overtime_minutes', type: 'int', default: 0 })
  maxDailyOvertimeMinutes: number;

  @Column({ name: 'overtime_rate_multiplier', type: 'decimal', precision: 5, scale: 2, default: 1 })
  overtimeRateMultiplier: string;

  @Column({ name: 'weekend_multiplier', type: 'decimal', precision: 5, scale: 2, default: 1 })
  weekendMultiplier: string;

  @Column({ name: 'holiday_multiplier', type: 'decimal', precision: 5, scale: 2, default: 1 })
  holidayMultiplier: string;

  @Column({ name: 'requires_approval', type: 'boolean', default: false })
  requiresApproval: boolean;

  @Column({ name: 'auto_calculate', type: 'boolean', default: true })
  autoCalculate: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Shift, (shift) => shift.overtimeRules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;
}
