import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { PerformanceDevelopmentGoal } from './performance-development-goal.entity';

@Entity('performance_development_plans')
@Index('IDX_performance_development_plan_company_status', [
  'companyId',
  'status',
])
@Index('IDX_performance_development_plan_employee', ['companyId', 'employeeId'])
export class PerformanceDevelopmentPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'source_review_id', type: 'int', nullable: true })
  sourceReviewId: number | null;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'target_completion_date', type: 'date', nullable: true })
  targetCompletionDate: string | null;

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

  @OneToMany(() => PerformanceDevelopmentGoal, (goal) => goal.plan, {
    cascade: true,
  })
  goals: PerformanceDevelopmentGoal[];
}
