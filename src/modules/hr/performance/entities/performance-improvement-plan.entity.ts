import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { PerformanceImprovementPlanStatusEnum } from '../enums/performance-improvement-plan-status.enum';
import { PerformanceImprovementMilestone } from './performance-improvement-milestone.entity';

@Entity('performance_improvement_plans')
@Unique('UQ_performance_improvement_plan_review', ['performanceReviewId'])
@Index('IDX_performance_improvement_plan_company_status', [
  'companyId',
  'status',
])
export class PerformanceImprovementPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_review_id', type: 'int' })
  performanceReviewId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({
    type: 'enum',
    enum: PerformanceImprovementPlanStatusEnum,
    enumName: 'performance_improvement_plan_status_enum',
    default: PerformanceImprovementPlanStatusEnum.DRAFT,
  })
  status: PerformanceImprovementPlanStatusEnum;

  @Column({ name: 'summary', type: 'text' })
  summary: string;

  @Column({ name: 'objectives', type: 'jsonb' })
  objectives: string[];

  @Column({
    name: 'employee_acknowledged_at',
    type: 'timestamptz',
    nullable: true,
  })
  employeeAcknowledgedAt: Date | null;

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(
    () => PerformanceImprovementMilestone,
    (milestone) => milestone.plan,
    {
      cascade: true,
    },
  )
  milestones: PerformanceImprovementMilestone[];
}
