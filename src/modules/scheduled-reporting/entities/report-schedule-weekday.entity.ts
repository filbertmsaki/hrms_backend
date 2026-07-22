import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReportWeekdayEnum } from '../enums/report-weekday.enum';
import { ReportSchedule } from './report-schedule.entity';

/**
 * Selected weekday for weekly report schedules, kept separate so schedules can
 * support any number of weekdays without denormalized columns.
 */
@Entity('report_schedule_weekdays')
@Index('IDX_report_schedule_weekdays_schedule_id', ['scheduleId'])
@Index(
  'UQ_report_schedule_weekdays_schedule_weekday',
  ['scheduleId', 'weekday'],
  {
    unique: true,
  },
)
export class ReportScheduleWeekday {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'schedule_id', type: 'int' })
  scheduleId: number;

  @Column({
    name: 'weekday',
    type: 'enum',
    enum: ReportWeekdayEnum,
    enumName: 'report_weekday_enum',
  })
  weekday: ReportWeekdayEnum;

  @ManyToOne(() => ReportSchedule, (schedule) => schedule.weekdays, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'schedule_id' })
  schedule: ReportSchedule;
}
