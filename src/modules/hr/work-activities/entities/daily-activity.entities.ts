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
import {
  DailyActivityReportStatusEnum,
  DailyActivityPriorityEnum,
  DailyActivitySourceEnum,
  DailyActivityStatusEnum,
  DailyActivityOriginEnum,
  DailyActivityEntryReviewStatusEnum,
} from '../enums/work-activity.enums';

@Entity('daily_activity_reports')
@Unique('UQ_daily_activity_employee_date', [
  'companyId',
  'employeeId',
  'activityDate',
])
@Index('IDX_daily_activity_company_status', ['companyId', 'status'])
@Index('IDX_daily_activity_date', ['activityDate'])
export class DailyActivityReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'activity_date', type: 'date' })
  activityDate: string;

  @Column({
    type: 'varchar',
    length: 40,
    default: DailyActivityReportStatusEnum.DRAFT,
  })
  status: DailyActivityReportStatusEnum;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'manager_company_user_id', type: 'int', nullable: true })
  managerCompanyUserId: number | null;

  @Column({ name: 'employee_snapshot', type: 'jsonb' })
  employeeSnapshot: Record<string, unknown>;

  @Column({ name: 'policy_snapshot', type: 'jsonb' })
  policySnapshot: Record<string, unknown>;

  @Column({ name: 'attendance_snapshot', type: 'jsonb', nullable: true })
  attendanceSnapshot: Record<string, unknown> | null;

  @Column({ name: 'overall_remarks', type: 'text', nullable: true })
  overallRemarks: string | null;

  @Column({ name: 'employee_summary', type: 'text', nullable: true })
  employeeSummary: string | null;

  @Column({ name: 'manager_comments', type: 'text', nullable: true })
  managerComments: string | null;

  @Column({
    name: 'manager_rating',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  managerRating: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'reviewed_by_company_user_id', type: 'int', nullable: true })
  reviewedByCompanyUserId: number | null;

  @Column({ name: 'submission_is_late', type: 'boolean', default: false })
  submissionIsLate: boolean;

  @Column({ name: 'submission_delay_minutes', type: 'int', default: 0 })
  submissionDelayMinutes: number;

  @Column({ name: 'client_request_id', type: 'uuid', nullable: true })
  clientRequestId: string | null;

  @Column({
    name: 'source',
    type: 'varchar',
    length: 30,
    default: DailyActivitySourceEnum.WEB,
  })
  source: DailyActivitySourceEnum;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('daily_activity_entries')
@Index('IDX_daily_activity_entry_report', ['dailyActivityReportId'])
@Index('IDX_daily_activity_entry_category', ['activityCategoryId'])
export class DailyActivityEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'daily_activity_report_id', type: 'int' })
  dailyActivityReportId: number;

  @Column({ name: 'activity_category_id', type: 'int' })
  activityCategoryId: number;

  @Column({ name: 'kpi_definition_id', type: 'int', nullable: true })
  kpiDefinitionId: number | null;

  @Column({ name: 'employee_kpi_id', type: 'int', nullable: true })
  employeeKpiId: number | null;

  @Column({
    name: 'project_reference',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  projectReference: string | null;

  @Column({
    name: 'task_reference',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  taskReference: string | null;

  @Column({ name: 'field_party_id', type: 'int', nullable: true })
  fieldPartyId: number | null;

  @Column({
    name: 'external_reference_type',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  externalReferenceType: string | null;

  @Column({
    name: 'external_reference_id',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  externalReferenceId: string | null;

  @Column({ type: 'varchar', length: 250 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'expected_result', type: 'text', nullable: true })
  expectedResult: string | null;

  @Column({ name: 'due_date', type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  @Column({ name: 'completion_date', type: 'timestamptz', nullable: true })
  completionDate: Date | null;

  @Column({ name: 'planned_start_time', type: 'timestamptz', nullable: true })
  plannedStartTime: Date | null;

  @Column({ name: 'planned_end_time', type: 'timestamptz', nullable: true })
  plannedEndTime: Date | null;

  @Column({ name: 'actual_start_time', type: 'timestamptz', nullable: true })
  actualStartTime: Date | null;

  @Column({ name: 'actual_end_time', type: 'timestamptz', nullable: true })
  actualEndTime: Date | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: DailyActivityStatusEnum.PLANNED,
  })
  status: DailyActivityStatusEnum;

  @Column({
    type: 'varchar',
    length: 30,
    default: DailyActivityOriginEnum.SELF_CREATED,
  })
  origin: DailyActivityOriginEnum;

  @Column({
    name: 'review_status',
    type: 'varchar',
    length: 30,
    default: DailyActivityEntryReviewStatusEnum.NOT_REQUIRED,
  })
  reviewStatus: DailyActivityEntryReviewStatusEnum;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'reviewed_by_company_user_id', type: 'int', nullable: true })
  reviewedByCompanyUserId: number | null;

  @Column({ type: 'text', nullable: true })
  outcome: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: DailyActivityPriorityEnum.MEDIUM,
  })
  priority: DailyActivityPriorityEnum;

  @Column({ name: 'assigned_by_company_user_id', type: 'int', nullable: true })
  assignedByCompanyUserId: number | null;

  @Column({ name: 'assigned_by_employee_id', type: 'int', nullable: true })
  assignedByEmployeeId: number | null;

  @Column({ name: 'assigned_by_snapshot', type: 'jsonb', nullable: true })
  assignedBySnapshot: Record<string, unknown> | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  checklist: Array<Record<string, unknown>>;

  @Column({ name: 'defer_reason', type: 'text', nullable: true })
  deferReason: string | null;

  @Column({ name: 'follow_up_date', type: 'date', nullable: true })
  followUpDate: string | null;

  @Column({
    name: 'completion_percentage',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  completionPercentage: string;

  @Column({ name: 'manager_comment', type: 'text', nullable: true })
  managerComment: string | null;

  @Column({ name: 'manager_validated', type: 'boolean', default: false })
  managerValidated: boolean;

  @Column({ name: 'linked_field_visit_id', type: 'int', nullable: true })
  linkedFieldVisitId: number | null;

  @Column({ name: 'client_request_id', type: 'uuid', nullable: true })
  clientRequestId: string | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('daily_activity_comments')
@Index('IDX_daily_activity_comment_entry', [
  'companyId',
  'dailyActivityEntryId',
])
export class DailyActivityComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'daily_activity_entry_id', type: 'int' })
  dailyActivityEntryId: number;

  @Column({ name: 'author_company_user_id', type: 'int', nullable: true })
  authorCompanyUserId: number | null;

  @Column({ name: 'author_employee_id', type: 'int', nullable: true })
  authorEmployeeId: number | null;

  @Column({ name: 'author_snapshot', type: 'jsonb', nullable: true })
  authorSnapshot: Record<string, unknown> | null;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('daily_activity_evidence')
export class DailyActivityEvidence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'daily_activity_entry_id', type: 'int' })
  dailyActivityEntryId: number;

  @Column({ name: 'document_id', type: 'int' })
  documentId: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'submitted_by_company_user_id', type: 'int', nullable: true })
  submittedByCompanyUserId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
