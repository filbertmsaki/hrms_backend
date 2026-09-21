import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { PerformanceWorkflowStepTypeEnum } from '../enums/performance-workflow-step-type.enum';

export type PerformanceWorkflowConfigStep = {
  code: string;
  label: string;
  type: PerformanceWorkflowStepTypeEnum;
  sequenceNumber: number;
  required: boolean;
  canFinalize: boolean;
  configuration?: Record<string, unknown> | null;
};

@Entity('performance_workflow_configs')
@Unique('UQ_performance_workflow_company_code', ['companyId', 'code'])
@Index('IDX_performance_workflow_company_status_default', [
  'companyId',
  'status',
  'isDefault',
])
export class PerformanceWorkflowConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'applies_to_department_id', type: 'int', nullable: true })
  appliesToDepartmentId: number | null;

  @Column({ name: 'applies_to_position_id', type: 'int', nullable: true })
  appliesToPositionId: number | null;

  @Column({ name: 'review_type', type: 'varchar', length: 60, nullable: true })
  reviewType: string | null;

  @Column({ type: 'jsonb' })
  steps: PerformanceWorkflowConfigStep[];

  @Column({ name: 'created_by_company_user_id', type: 'int', nullable: true })
  createdByCompanyUserId: number | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
