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
import { TimetableDay } from './timetable-day.entity';
import { Shift } from '../../../shift/shifts/entities/shift.entity';

@Entity('timetable_day_shift_options')
@Index('UQ_timetable_day_shift_option', ['timetableDayId', 'shiftId'], {
  unique: true,
})
@Index('IDX_timetable_day_shift_options_day_priority', [
  'timetableDayId',
  'priorityOrder',
])
@Index('UQ_timetable_day_shift_options_primary', ['timetableDayId'], {
  unique: true,
  where: '"is_primary" = true',
})
export class TimetableDayShiftOption {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'timetable_day_id', type: 'int' }) timetableDayId: number;
  @Column({ name: 'shift_id', type: 'int' }) shiftId: number;
  @Column({ name: 'priority_order', type: 'int', default: 0 })
  priorityOrder: number;
  @Column({ name: 'max_employees', type: 'int', nullable: true }) maxEmployees:
    | number
    | null;
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
  @ManyToOne(() => TimetableDay, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timetable_day_id' })
  timetableDay: TimetableDay;
  @ManyToOne(() => Shift, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;
}
