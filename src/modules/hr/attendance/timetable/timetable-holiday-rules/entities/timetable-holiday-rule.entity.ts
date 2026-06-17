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
import { HolidayGroup } from '../../../holidays/entities/holiday-group.entity';
import { TimetableHolidayActionTypeEnum } from '../enums/timetable-holiday-action-type.enum';

@Entity('timetable_holiday_rules')
@Index('IDX_timetable_holiday_rules_timetable_id', ['timetableId'])
@Index('IDX_timetable_holiday_rules_holiday_group_id', ['holidayGroupId'])
@Index(
  'UQ_timetable_holiday_rules_timetable_group',
  ['timetableId', 'holidayGroupId'],
  { unique: true },
)
export class TimetableHolidayRule {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'timetable_id', type: 'int' })
  timetableId: number;

  @Column({ name: 'holiday_group_id', type: 'int' })
  holidayGroupId: number;

  @Column({
    name: 'action_type',
    type: 'enum',
    enum: TimetableHolidayActionTypeEnum,
  })
  actionType: TimetableHolidayActionTypeEnum;

  @Column({ name: 'apply_overtime_rules', type: 'boolean', default: false })
  applyOvertimeRules: boolean;

  @Column({ name: 'auto_mark_offday', type: 'boolean', default: true })
  autoMarkOffday: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Timetable, (timetable) => timetable.holidayRules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'timetable_id' })
  timetable: Timetable;

  @ManyToOne(() => HolidayGroup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'holiday_group_id' })
  holidayGroup: HolidayGroup;
}
