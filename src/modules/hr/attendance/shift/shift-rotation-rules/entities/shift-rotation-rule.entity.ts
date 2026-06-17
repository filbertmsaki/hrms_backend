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
import { ShiftRotationGroup } from '../../shift-rotation-groups/entities/shift-rotation-group.entity';

@Entity('shift_rotation_rules')
@Index('IDX_shift_rotation_rules_rotation_group_id', ['rotationGroupId'])
@Index('IDX_shift_rotation_rules_shift_id', ['shiftId'])
@Index('UQ_shift_rotation_rules_group_day', ['rotationGroupId', 'dayIndex'], {
  unique: true,
})
export class ShiftRotationRule {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'rotation_group_id', type: 'int' })
  rotationGroupId: number;

  @Column({ name: 'shift_id', type: 'int', nullable: true })
  shiftId: number | null;

  @Column({ name: 'day_index', type: 'int' })
  dayIndex: number;

  @Column({ name: 'is_off_day', type: 'boolean', default: false })
  isOffDay: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => ShiftRotationGroup, (rotationGroup) => rotationGroup.rules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'rotation_group_id' })
  rotationGroup: ShiftRotationGroup;

  @ManyToOne(() => Shift, (shift) => shift.rotationRules, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'shift_id' })
  shift: Shift | null;
}
