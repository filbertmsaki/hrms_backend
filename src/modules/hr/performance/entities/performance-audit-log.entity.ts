import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('performance_audit_logs')
@Index('IDX_performance_audit_company_action', ['companyId', 'action'])
@Index('IDX_performance_audit_created_at', ['createdAt'])
export class PerformanceAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 120 })
  action: string;

  @Column({ name: 'actor_company_user_id', type: 'int', nullable: true })
  actorCompanyUserId: number | null;

  @Column({ name: 'actor_roles', type: 'text', array: true, default: '{}' })
  actorRoles: string[];

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'performance_review_id', type: 'int', nullable: true })
  performanceReviewId: number | null;

  @Column({ name: 'kpi_achievement_id', type: 'int', nullable: true })
  kpiAchievementId: number | null;

  @Column({ name: 'before_values', type: 'jsonb', nullable: true })
  beforeValues: Record<string, unknown> | null;

  @Column({ name: 'after_values', type: 'jsonb', nullable: true })
  afterValues: Record<string, unknown> | null;

  @Column({ name: 'request_id', type: 'varchar', length: 120, nullable: true })
  requestId: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 80, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
