import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { PerformanceDevelopmentPlan } from './performance-development-plan.entity';

@Entity('performance_development_goals')
@Index('IDX_performance_development_goal_due_status', [
  'companyId',
  'targetDate',
  'status',
])
export class PerformanceDevelopmentGoal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @Column({ name: 'carry_forward_from_goal_id', type: 'int', nullable: true })
  carryForwardFromGoalId: number | null;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  category: string | null;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate: string | null;

  @Column({ type: 'varchar', length: 30, default: 'OPEN' })
  status: string;

  @Column({ name: 'progress_percent', type: 'int', default: 0 })
  progressPercent: number;

  @Column({ name: 'success_measure', type: 'text', nullable: true })
  successMeasure: string | null;

  @Column({ name: 'support_required', type: 'text', nullable: true })
  supportRequired: string | null;

  @Column({ name: 'employee_comment', type: 'text', nullable: true })
  employeeComment: string | null;

  @Column({ name: 'manager_comment', type: 'text', nullable: true })
  managerComment: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @VersionColumn()
  version: number;

  @ManyToOne(() => PerformanceDevelopmentPlan, (plan) => plan.goals, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'plan_id' })
  plan: PerformanceDevelopmentPlan;
}
