import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { PerformanceAppealStatusEnum } from '../enums/performance-appeal-status.enum';

@Entity('performance_appeals')
@Index('IDX_performance_appeal_review_status', [
  'performanceReviewId',
  'status',
])
export class PerformanceAppeal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'performance_review_id', type: 'int' })
  performanceReviewId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({
    type: 'enum',
    enum: PerformanceAppealStatusEnum,
    enumName: 'performance_appeal_status_enum',
    default: PerformanceAppealStatusEnum.SUBMITTED,
  })
  status: PerformanceAppealStatusEnum;

  @Column({ name: 'reason', type: 'text' })
  reason: string;

  @Column({ name: 'requested_changes', type: 'jsonb', nullable: true })
  requestedChanges: Record<string, unknown> | null;

  @Column({ name: 'resolution', type: 'jsonb', nullable: true })
  resolution: Record<string, unknown> | null;

  @Column({ name: 'resolved_by_company_user_id', type: 'int', nullable: true })
  resolvedByCompanyUserId: number | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
