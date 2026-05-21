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
import { ShiftBreakTypeEnum } from '../enums/shift-break-type.enum';

@Entity('shift_breaks')
@Index('IDX_shift_breaks_shift_id', ['shiftId'])
export class ShiftBreak {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'shift_id', type: 'int' })
  shiftId: number;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'break_type', type: 'enum', enum: ShiftBreakTypeEnum })
  breakType: ShiftBreakTypeEnum;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'duration_minutes', type: 'int', default: 0 })
  durationMinutes: number;

  @Column({ name: 'is_paid', type: 'boolean', default: false })
  isPaid: boolean;

  @Column({ name: 'is_flexible', type: 'boolean', default: false })
  isFlexible: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Shift, (shift) => shift.breaks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift;
}
