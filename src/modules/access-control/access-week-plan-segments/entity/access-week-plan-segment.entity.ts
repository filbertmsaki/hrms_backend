import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { AccessWeekPlan } from '../../access-week-plans/entity/access-week-plan.entity';
import { AccessDayOfWeekEnum } from '../../access-week-plans/enum/access-day-of-week.enum';

@Entity('access_week_plan_segments')
@Index('IDX_access_week_plan_segments_week_plan_id', ['weekPlanId'])
@Unique('UQ_access_week_plan_segments_week_day_segment', ['weekPlanId', 'weekDay', 'segmentNo'])
export class AccessWeekPlanSegment {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'week_plan_id', type: 'int' })
  weekPlanId: number;

  @Column({ name: 'week_day', type: 'enum', enum: AccessDayOfWeekEnum })
  weekDay: AccessDayOfWeekEnum;

  @Column({ name: 'segment_no', type: 'int' })
  segmentNo: number;

  @Column({ name: 'enable', type: 'boolean', default: false })
  enable: boolean;

  @Column({ name: 'begin_time', type: 'time' })
  beginTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => AccessWeekPlan, (weekPlan) => weekPlan.segments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'week_plan_id' })
  weekPlan: AccessWeekPlan;
}

