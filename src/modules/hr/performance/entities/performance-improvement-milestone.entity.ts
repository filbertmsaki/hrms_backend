import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { PerformanceImprovementMilestoneStatusEnum } from '../enums/performance-improvement-milestone-status.enum';
import { PerformanceImprovementPlan } from './performance-improvement-plan.entity';

@Entity('performance_improvement_milestones')
export class PerformanceImprovementMilestone {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @Column({ name: 'title', type: 'varchar', length: 180 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({
    type: 'enum',
    enum: PerformanceImprovementMilestoneStatusEnum,
    default: PerformanceImprovementMilestoneStatusEnum.OPEN,
  })
  status: PerformanceImprovementMilestoneStatusEnum;

  @Column({ name: 'manager_comment', type: 'text', nullable: true })
  managerComment: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @VersionColumn()
  version: number;

  @ManyToOne(() => PerformanceImprovementPlan, (plan) => plan.milestones, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'plan_id' })
  plan: PerformanceImprovementPlan;
}
