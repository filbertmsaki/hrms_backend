import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {
  WorkActivityExceptionStatusEnum,
  WorkActivitySummaryPeriodEnum,
} from '../enums/work-activity.enums';

@Entity('work_activity_period_summaries')
@Unique('UQ_work_activity_summary_employee_period', [
  'companyId',
  'employeeId',
  'periodType',
  'dateFrom',
  'dateTo',
])
export class WorkActivityPeriodSummary {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'period_type', type: 'varchar', length: 20 })
  periodType: WorkActivitySummaryPeriodEnum;

  @Column({ name: 'date_from', type: 'date' })
  dateFrom: string;

  @Column({ name: 'date_to', type: 'date' })
  dateTo: string;

  @Column({ name: 'scheduled_work_days', type: 'int', default: 0 })
  scheduledWorkDays: number;

  @Column({ name: 'activity_submission_days', type: 'int', default: 0 })
  activitySubmissionDays: number;

  @Column({ name: 'on_time_submission_days', type: 'int', default: 0 })
  onTimeSubmissionDays: number;

  @Column({ name: 'planned_activity_count', type: 'int', default: 0 })
  plannedActivityCount: number;

  @Column({ name: 'completed_activity_count', type: 'int', default: 0 })
  completedActivityCount: number;

  @Column({ name: 'deferred_activity_count', type: 'int', default: 0 })
  deferredActivityCount: number;

  @Column({ name: 'planned_visit_count', type: 'int', default: 0 })
  plannedVisitCount: number;

  @Column({ name: 'completed_visit_count', type: 'int', default: 0 })
  completedVisitCount: number;

  @Column({ name: 'unplanned_visit_count', type: 'int', default: 0 })
  unplannedVisitCount: number;

  @Column({ name: 'lead_count', type: 'int', default: 0 })
  leadCount: number;

  @Column({ name: 'quotation_count', type: 'int', default: 0 })
  quotationCount: number;

  @Column({ name: 'business_closed_count', type: 'int', default: 0 })
  businessClosedCount: number;

  @Column({
    name: 'reported_potential_value',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  reportedPotentialValue: string;

  @Column({
    name: 'validated_actual_value',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  validatedActualValue: string;

  @Column({
    name: 'activity_completion_rate',
    type: 'decimal',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  activityCompletionRate: string | null;

  @Column({
    name: 'visit_completion_rate',
    type: 'decimal',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  visitCompletionRate: string | null;

  @Column({
    name: 'submission_discipline_rate',
    type: 'decimal',
    precision: 7,
    scale: 4,
    nullable: true,
  })
  submissionDisciplineRate: string | null;

  @Column({ name: 'manager_comments', type: 'text', nullable: true })
  managerComments: string | null;

  @Column({ name: 'calculation_snapshot', type: 'jsonb' })
  calculationSnapshot: Record<string, unknown>;

  @Column({ name: 'calculation_hash', type: 'varchar', length: 128 })
  calculationHash: string;

  @Column({ type: 'varchar', length: 30, default: 'CALCULATED' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('field_location_access_logs')
@Index('IDX_field_location_access_company_time', ['companyId', 'accessedAt'])
export class FieldLocationAccessLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'actor_company_user_id', type: 'int' })
  actorCompanyUserId: number;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'access_type', type: 'varchar', length: 80 })
  accessType: string;

  @Column({ name: 'date_from', type: 'date', nullable: true })
  dateFrom: string | null;

  @Column({ name: 'date_to', type: 'date', nullable: true })
  dateTo: string | null;

  @Column({ name: 'purpose', type: 'text' })
  purpose: string;

  @Column({ name: 'request_id', type: 'varchar', length: 100, nullable: true })
  requestId: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 100, nullable: true })
  ipAddress: string | null;

  @Column({
    name: 'accessed_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  accessedAt: Date;
}

@Entity('work_activity_audit_logs')
@Index('IDX_work_activity_audit_company_action', ['companyId', 'action'])
@Index('IDX_work_activity_audit_created_at', ['createdAt'])
export class WorkActivityAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 120 })
  action: string;

  @Column({ name: 'actor_company_user_id', type: 'int', nullable: true })
  actorCompanyUserId: number | null;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 80, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'varchar', length: 120, nullable: true })
  entityId: string | null;

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

@Entity('work_activity_exceptions')
@Unique('UQ_work_activity_exception_employee_date_type', [
  'companyId',
  'employeeId',
  'exceptionDate',
  'exceptionType',
])
@Index('IDX_work_activity_exception_status', ['companyId', 'status'])
export class WorkActivityException {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'exception_date', type: 'date' })
  exceptionDate: string;

  @Column({ name: 'exception_type', type: 'varchar', length: 60 })
  exceptionType: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: WorkActivityExceptionStatusEnum.OPEN,
  })
  status: WorkActivityExceptionStatusEnum;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
