import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimetableRotation } from '../../timetable-rotations/entities/timetable-rotation.entity';

@Entity('timetable_rotation_rules')
@Index('IDX_timetable_rotation_rules_rotation_id', ['rotationId'])
@Index('IDX_timetable_rotation_rules_shift_id', ['shiftId'])
@Index('UQ_timetable_rotation_rules_rotation_day', ['rotationId', 'dayIndex'], { unique: true })
export class TimetableRotationRule {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'rotation_id', type: 'int' })
  rotationId: number;

  @Column({ name: 'day_index', type: 'int' })
  dayIndex: number;

  @Column({ name: 'shift_id', type: 'int', nullable: true })
  shiftId: number | null;

  @Column({ name: 'is_off_day', type: 'boolean', default: false })
  isOffDay: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => TimetableRotation, (rotation) => rotation.rules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rotation_id' })
  rotation: TimetableRotation;
}
