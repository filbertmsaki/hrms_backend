import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';
import {
  AnalyticsAggregationEnum,
  AnalyticsDatasetTypeEnum,
  AnalyticsExportStatusEnum,
  AnalyticsRefreshModeEnum,
  AnalyticsSensitivityEnum,
  AnalyticsSnapshotStatusEnum,
  AnalyticsTimeGrainEnum,
} from '../analytics.enums';

const ANALYTICS_SCHEMA = 'analytics';

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_datasets' })
@Unique('UQ_analytics_dataset_company_code', ['companyId', 'code'])
export class AnalyticsDataset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({
    name: 'dataset_type',
    type: 'enum',
    enum: AnalyticsDatasetTypeEnum,
  })
  datasetType: AnalyticsDatasetTypeEnum;

  @Column({ name: 'source_code', type: 'varchar', length: 100 })
  sourceCode: string;

  @Column({ name: 'physical_name', type: 'varchar', length: 180 })
  physicalName: string;

  @Column({
    name: 'refresh_mode',
    type: 'enum',
    enum: AnalyticsRefreshModeEnum,
  })
  refreshMode: AnalyticsRefreshModeEnum;

  @Column({ name: 'refresh_configuration', type: 'jsonb', nullable: true })
  refreshConfiguration: Record<string, unknown> | null;

  @Column({ name: 'sensitivity', type: 'enum', enum: AnalyticsSensitivityEnum })
  sensitivity: AnalyticsSensitivityEnum;

  @Column({ name: 'allowed_dimensions', type: 'jsonb' })
  allowedDimensions: string[];

  @Column({ name: 'allowed_measures', type: 'jsonb' })
  allowedMeasures: string[];

  @Column({ name: 'latest_refresh_at', type: 'timestamptz', nullable: true })
  latestRefreshAt: Date | null;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @VersionColumn()
  version: number;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_metric_definitions' })
@Unique('UQ_analytics_metric_company_code_version', [
  'companyId',
  'code',
  'versionNumber',
])
export class AnalyticsMetricDefinition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber: number;

  @Column({ name: 'dataset_code', type: 'varchar', length: 100 })
  datasetCode: string;

  @Column({ name: 'aggregation', type: 'enum', enum: AnalyticsAggregationEnum })
  aggregation: AnalyticsAggregationEnum;

  @Column({ name: 'formula_code', type: 'varchar', length: 100 })
  formulaCode: string;

  @Column({ name: 'formula_configuration', type: 'jsonb' })
  formulaConfiguration: Record<string, unknown>;

  @Column({
    name: 'default_time_grain',
    type: 'enum',
    enum: AnalyticsTimeGrainEnum,
  })
  defaultTimeGrain: AnalyticsTimeGrainEnum;

  @Column({ name: 'allowed_dimensions', type: 'jsonb' })
  allowedDimensions: string[];

  @Column({ name: 'default_filters', type: 'jsonb', nullable: true })
  defaultFilters: Record<string, unknown> | null;

  @Column({ name: 'exclusion_rules', type: 'jsonb', nullable: true })
  exclusionRules: Record<string, unknown> | null;

  @Column({ name: 'rounding_scale', type: 'int', default: 2 })
  roundingScale: number;

  @Column({ name: 'sensitivity', type: 'enum', enum: AnalyticsSensitivityEnum })
  sensitivity: AnalyticsSensitivityEnum;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_locked', default: false })
  isLocked: boolean;

  @Column({ name: 'definition_hash', type: 'varchar', length: 128 })
  definitionHash: string;

  @Column({ name: 'approved_by_company_user_id', type: 'int', nullable: true })
  approvedByCompanyUserId: number | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'dim_date' })
export class AnalyticsDateDimension {
  @PrimaryColumn({ name: 'date_key', type: 'int' })
  dateKey: number;

  @Column({ name: 'calendar_date', type: 'date', unique: true })
  calendarDate: string;

  @Column({ name: 'calendar_year', type: 'int' })
  calendarYear: number;

  @Column({ name: 'calendar_quarter', type: 'int' })
  calendarQuarter: number;

  @Column({ name: 'calendar_month', type: 'int' })
  calendarMonth: number;

  @Column({ name: 'month_name', type: 'varchar', length: 20 })
  monthName: string;

  @Column({ name: 'week_of_year', type: 'int' })
  weekOfYear: number;

  @Column({ name: 'day_of_month', type: 'int' })
  dayOfMonth: number;

  @Column({ name: 'day_of_week', type: 'int' })
  dayOfWeek: number;

  @Column({ name: 'is_weekend' })
  isWeekend: boolean;

  @Column({
    name: 'financial_year_code',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  financialYearCode: string | null;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'dim_employee_history' })
@Index('IDX_dim_employee_history_lookup', [
  'companyId',
  'employeeId',
  'effectiveFrom',
  'effectiveTo',
])
export class AnalyticsEmployeeHistoryDimension {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'employee_no', type: 'varchar', length: 60 })
  employeeNo: string;

  @Column({ name: 'full_name', type: 'varchar', length: 220 })
  fullName: string;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({ name: 'position_id', type: 'int', nullable: true })
  positionId: number | null;

  @Column({ name: 'grade_id', type: 'int', nullable: true })
  gradeId: number | null;

  @Column({ name: 'cost_center_id', type: 'int', nullable: true })
  costCenterId: number | null;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'employment_status', type: 'varchar', length: 50 })
  employmentStatus: string;

  @Column({
    name: 'employment_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  employmentType: string | null;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_current', default: true })
  isCurrent: boolean;

  @Column({ name: 'source_hash', type: 'varchar', length: 128 })
  sourceHash: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'fact_workforce_daily' })
@Unique('UQ_fact_workforce_employee_date', [
  'companyId',
  'employeeId',
  'snapshotDate',
])
@Index('IDX_fact_workforce_company_date', ['companyId', 'snapshotDate'])
@Index('IDX_fact_workforce_department_date', [
  'companyId',
  'departmentId',
  'snapshotDate',
])
export class AnalyticsWorkforceDailyFact {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'employee_dimension_id', type: 'bigint' })
  employeeDimensionId: string;

  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate: string;

  @Column({ name: 'date_key', type: 'int' })
  dateKey: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'department_id', type: 'int', nullable: true })
  departmentId: number | null;

  @Column({ name: 'position_id', type: 'int', nullable: true })
  positionId: number | null;

  @Column({ name: 'grade_id', type: 'int', nullable: true })
  gradeId: number | null;

  @Column({ name: 'cost_center_id', type: 'int', nullable: true })
  costCenterId: number | null;

  @Column({ name: 'manager_employee_id', type: 'int', nullable: true })
  managerEmployeeId: number | null;

  @Column({ name: 'is_active_headcount' })
  isActiveHeadcount: boolean;

  @Column({ name: 'is_probation' })
  isProbation: boolean;

  @Column({ name: 'is_confirmed' })
  isConfirmed: boolean;

  @Column({ name: 'is_new_joiner' })
  isNewJoiner: boolean;

  @Column({ name: 'is_exit' })
  isExit: boolean;

  @Column({ name: 'service_months', type: 'int' })
  serviceMonths: number;

  @Column({ name: 'source_snapshot_hash', type: 'varchar', length: 128 })
  sourceSnapshotHash: string;

  @Column({ name: 'snapshot_run_id', type: 'bigint' })
  snapshotRunId: string;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'fact_attendance_daily' })
@Unique('UQ_fact_attendance_employee_date', [
  'companyId',
  'employeeId',
  'attendanceDate',
])
@Index('IDX_fact_attendance_company_date', ['companyId', 'attendanceDate'])
export class AnalyticsAttendanceDailyFact {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ name: 'date_key', type: 'int' })
  dateKey: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'status', type: 'varchar', length: 50 })
  status: string;

  @Column({ name: 'work_minutes', type: 'int', default: 0 })
  workMinutes: number;

  @Column({ name: 'late_minutes', type: 'int', default: 0 })
  lateMinutes: number;

  @Column({ name: 'missing_punch_count', type: 'int', default: 0 })
  missingPunchCount: number;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;

  @Column({ name: 'source_snapshot_hash', type: 'varchar', length: 128 })
  sourceSnapshotHash: string;

  @Column({ name: 'snapshot_run_id', type: 'bigint' })
  snapshotRunId: string;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'fact_payroll_employee_period' })
@Unique('UQ_fact_payroll_result', ['companyId', 'payrollResultId'])
@Index('IDX_fact_payroll_company_period', ['companyId', 'payrollPeriodId'])
export class AnalyticsPayrollEmployeePeriodFact {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'payroll_run_id', type: 'int' })
  payrollRunId: number;

  @Column({ name: 'payroll_period_id', type: 'int' })
  payrollPeriodId: number;

  @Column({ name: 'payroll_result_id', type: 'int' })
  payrollResultId: number;

  @Column({
    name: 'gross_pay',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: '0',
  })
  grossPay: string;

  @Column({
    name: 'net_pay',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: '0',
  })
  netPay: string;

  @Column({
    name: 'employee_deductions',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: '0',
  })
  employeeDeductions: string;

  @Column({
    name: 'total_employer_cost',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: '0',
  })
  totalEmployerCost: string;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'TZS' })
  currency: string;

  @Column({ name: 'source_snapshot_hash', type: 'varchar', length: 128 })
  sourceSnapshotHash: string;

  @Column({ name: 'snapshot_run_id', type: 'bigint' })
  snapshotRunId: string;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'fact_employee_finance_monthly' })
@Unique('UQ_fact_employee_finance_account_month', [
  'companyId',
  'accountId',
  'monthStart',
])
@Index('IDX_fact_employee_finance_company_month', ['companyId', 'monthStart'])
export class AnalyticsEmployeeFinanceMonthlyFact {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId: number;

  @Column({ name: 'account_id', type: 'int' })
  accountId: number;

  @Column({ name: 'product_type', type: 'varchar', length: 40 })
  productType: string;

  @Column({ name: 'month_start', type: 'date' })
  monthStart: string;

  @Column({
    name: 'opening_balance',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: '0',
  })
  openingBalance: string;

  @Column({
    name: 'disbursed_amount',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: '0',
  })
  disbursedAmount: string;

  @Column({
    name: 'repaid_amount',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: '0',
  })
  repaidAmount: string;

  @Column({
    name: 'closing_balance',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: '0',
  })
  closingBalance: string;

  @Column({
    name: 'arrears_amount',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: '0',
  })
  arrearsAmount: string;

  @Column({ name: 'snapshot_run_id', type: 'bigint' })
  snapshotRunId: string;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_generic_facts' })
@Unique('UQ_analytics_generic_fact_source', [
  'companyId',
  'datasetCode',
  'sourceId',
])
@Index('IDX_analytics_generic_fact_company_date', [
  'companyId',
  'datasetCode',
  'factDate',
])
export class AnalyticsGenericFact {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'dataset_code', type: 'varchar', length: 100 })
  datasetCode: string;

  @Column({ name: 'source_id', type: 'varchar', length: 100 })
  sourceId: string;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ name: 'fact_date', type: 'date' })
  factDate: string;

  @Column({ name: 'date_key', type: 'int' })
  dateKey: number;

  @Column({ name: 'dimensions', type: 'jsonb' })
  dimensions: Record<string, unknown>;

  @Column({ name: 'measures', type: 'jsonb' })
  measures: Record<string, unknown>;

  @Column({ name: 'source_snapshot_hash', type: 'varchar', length: 128 })
  sourceSnapshotHash: string;

  @Column({ name: 'snapshot_run_id', type: 'bigint' })
  snapshotRunId: string;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_snapshot_runs' })
@Unique('UQ_analytics_snapshot_run_no', ['runNo'])
export class AnalyticsSnapshotRun {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ name: 'run_no', type: 'varchar', length: 80 })
  runNo: string;

  @Column({ name: 'dataset_code', type: 'varchar', length: 100 })
  datasetCode: string;

  @Column({
    name: 'refresh_mode',
    type: 'enum',
    enum: AnalyticsRefreshModeEnum,
  })
  refreshMode: AnalyticsRefreshModeEnum;

  @Column({ name: 'date_from', type: 'date', nullable: true })
  dateFrom: string | null;

  @Column({ name: 'date_to', type: 'date', nullable: true })
  dateTo: string | null;

  @Column({ type: 'enum', enum: AnalyticsSnapshotStatusEnum })
  status: AnalyticsSnapshotStatusEnum;

  @Column({ name: 'source_record_count', type: 'bigint', default: 0 })
  sourceRecordCount: string;

  @Column({ name: 'inserted_record_count', type: 'bigint', default: 0 })
  insertedRecordCount: string;

  @Column({ name: 'updated_record_count', type: 'bigint', default: 0 })
  updatedRecordCount: string;

  @Column({ name: 'failed_record_count', type: 'bigint', default: 0 })
  failedRecordCount: string;

  @Column({ name: 'source_hash', type: 'varchar', length: 128, nullable: true })
  sourceHash: string | null;

  @Column({ name: 'output_hash', type: 'varchar', length: 128, nullable: true })
  outputHash: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  warnings: Record<string, unknown>[] | null;

  @Column({ type: 'jsonb', nullable: true })
  errors: Record<string, unknown>[] | null;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_dashboards' })
@Unique('UQ_analytics_dashboard_company_code', ['companyId', 'code'])
export class AnalyticsDashboardDefinition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'varchar', length: 60 })
  audience: string;

  @Column({
    name: 'scope_type',
    type: 'varchar',
    length: 60,
    default: 'COMPANY',
  })
  scopeType: string;

  @Column({ name: 'required_permissions', type: 'jsonb' })
  requiredPermissions: string[];

  @Column({ name: 'cache_ttl_seconds', type: 'int', default: 300 })
  cacheTtlSeconds: number;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_dashboard_widgets' })
export class AnalyticsDashboardWidgetDefinition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'dashboard_id', type: 'int' })
  dashboardId: number;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Column({ name: 'metric_codes', type: 'jsonb' })
  metricCodes: string[];

  @Column({ name: 'visualization_type', type: 'varchar', length: 60 })
  visualizationType: string;

  @Column({ type: 'jsonb', nullable: true })
  configuration: Record<string, unknown> | null;

  @Column({ name: 'display_order', type: 'int', default: 100 })
  displayOrder: number;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_report_definitions' })
@Unique('UQ_analytics_report_company_code_version', [
  'companyId',
  'code',
  'versionNumber',
])
export class AnalyticsReportDefinition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber: number;

  @Column({ name: 'dataset_code', type: 'varchar', length: 100 })
  datasetCode: string;

  @Column({ name: 'allowed_dimensions', type: 'jsonb' })
  allowedDimensions: string[];

  @Column({ name: 'allowed_measures', type: 'jsonb' })
  allowedMeasures: string[];

  @Column({ name: 'required_permissions', type: 'jsonb' })
  requiredPermissions: string[];

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_locked', default: false })
  isLocked: boolean;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_refresh_checkpoints' })
@Unique('UQ_analytics_checkpoint_company_dataset', ['companyId', 'datasetCode'])
export class AnalyticsRefreshCheckpoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'dataset_code', type: 'varchar', length: 100 })
  datasetCode: string;

  @Column({
    name: 'last_successful_refresh_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastSuccessfulRefreshAt: Date | null;

  @Column({
    name: 'last_source_cursor',
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  lastSourceCursor: string | null;

  @Column({ name: 'last_run_id', type: 'bigint', nullable: true })
  lastRunId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_change_events' })
@Unique('UQ_analytics_change_event_idempotency', ['idempotencyKey'])
export class AnalyticsChangeEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ name: 'source_code', type: 'varchar', length: 100 })
  sourceCode: string;

  @Column({ name: 'source_id', type: 'varchar', length: 120 })
  sourceId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 80 })
  eventType: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
  idempotencyKey: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_export_jobs' })
@Unique('UQ_analytics_export_idempotency', ['companyId', 'idempotencyKey'])
export class AnalyticsExportJob {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'requested_by_company_user_id', type: 'int', nullable: true })
  requestedByCompanyUserId: number | null;

  @Column({ name: 'report_code', type: 'varchar', length: 100 })
  reportCode: string;

  @Column({ name: 'output_format', type: 'varchar', length: 20 })
  outputFormat: string;

  @Column({
    type: 'enum',
    enum: AnalyticsExportStatusEnum,
    default: AnalyticsExportStatusEnum.PENDING,
  })
  status: AnalyticsExportStatusEnum;

  @Column({ type: 'jsonb' })
  filters: Record<string, unknown>;

  @Column({ name: 'row_count', type: 'int', default: 0 })
  rowCount: number;

  @Column({ name: 'file_path', type: 'text', nullable: true })
  filePath: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
  idempotencyKey: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_alert_rules' })
export class AnalyticsAlertRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ name: 'metric_code', type: 'varchar', length: 100 })
  metricCode: string;

  @Column({ type: 'jsonb' })
  condition: Record<string, unknown>;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'analytics_access_logs' })
@Index('IDX_analytics_access_company_date', ['companyId', 'createdAt'])
export class AnalyticsAccessLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ name: 'actor_company_user_id', type: 'int', nullable: true })
  actorCompanyUserId: number | null;

  @Column({ name: 'employee_id', type: 'int', nullable: true })
  employeeId: number | null;

  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 80 })
  resourceType: string;

  @Column({ name: 'resource_code', type: 'varchar', length: 120 })
  resourceCode: string;

  @Column({ name: 'purpose', type: 'varchar', length: 180, nullable: true })
  purpose: string | null;

  @Column({ name: 'scope_hash', type: 'varchar', length: 128 })
  scopeHash: string;

  @Column({ name: 'sensitivity', type: 'enum', enum: AnalyticsSensitivityEnum })
  sensitivity: AnalyticsSensitivityEnum;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'statutory_report_definitions' })
@Unique('UQ_statutory_report_company_code_version', [
  'companyId',
  'code',
  'versionNumber',
])
export class StatutoryReportDefinition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ name: 'jurisdiction', type: 'varchar', length: 80 })
  jurisdiction: string;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber: number;

  @Column({ name: 'template_configuration', type: 'jsonb' })
  templateConfiguration: Record<string, unknown>;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;
}

@Entity({ schema: ANALYTICS_SCHEMA, name: 'statutory_report_runs' })
@Unique('UQ_statutory_report_run_no', ['runNo'])
export class StatutoryReportRun {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'run_no', type: 'varchar', length: 100 })
  runNo: string;

  @Column({ name: 'report_code', type: 'varchar', length: 100 })
  reportCode: string;

  @Column({ name: 'period_from', type: 'date' })
  periodFrom: string;

  @Column({ name: 'period_to', type: 'date' })
  periodTo: string;

  @Column({ name: 'source_hash', type: 'varchar', length: 128 })
  sourceHash: string;

  @Column({ name: 'output_hash', type: 'varchar', length: 128 })
  outputHash: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ type: 'varchar', length: 30, default: 'GENERATED' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
