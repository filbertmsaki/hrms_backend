import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimetableDay } from '../../timetable-days/entities/timetable-day.entity';

@Entity('timetable_shift_rules')
@Index('IDX_timetable_shift_rules_timetable_day_id', ['timetableDayId'])
@Index('IDX_timetable_shift_rules_shift_id', ['shiftId'])
@Index('UQ_timetable_shift_rules_day_priority', ['timetableDayId', 'priorityOrder'], { unique: true })
export class TimetableShiftRule {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'timetable_day_id', type: 'int' })
  timetableDayId: number;

  @Column({ name: 'shift_id', type: 'int' })
  shiftId: number;

  @Column({ name: 'priority_order', type: 'int', default: 1 })
  priorityOrder: number;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'max_employees', type: 'int', nullable: true })
  maxEmployees: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => TimetableDay, (timetableDay) => timetableDay.shiftRules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timetable_day_id' })
  timetableDay: TimetableDay;
}
