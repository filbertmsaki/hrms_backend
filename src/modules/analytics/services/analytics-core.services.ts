import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import Decimal from 'decimal.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DataSource, IsNull, Repository, type DeepPartial } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EmployeeFinanceMoney } from '../../hr/employee-finance/services/employee-finance-money.util';
import { PayrollMoney } from '../../hr/payroll/services/payroll-money.util';
import { HrAccessService } from '../../hr/shared/hr-access.service';
import {
  AnalyticsAggregationEnum,
  AnalyticsDatasetTypeEnum,
  AnalyticsExportStatusEnum,
  AnalyticsRefreshModeEnum,
  AnalyticsSensitivityEnum,
  AnalyticsSnapshotStatusEnum,
  AnalyticsTimeGrainEnum,
} from '../analytics.enums';
import {
  AnalyticsAccessLog,
  AnalyticsAttendanceDailyFact,
  AnalyticsChangeEvent,
  AnalyticsDataset,
  AnalyticsDateDimension,
  AnalyticsEmployeeFinanceMonthlyFact,
  AnalyticsEmployeeHistoryDimension,
  AnalyticsExportJob,
  AnalyticsGenericFact,
  AnalyticsMetricDefinition,
  AnalyticsPayrollEmployeePeriodFact,
  AnalyticsRefreshCheckpoint,
  AnalyticsSnapshotRun,
  AnalyticsWorkforceDailyFact,
  StatutoryReportRun,
} from '../entities/analytics.entities';
import {
  AnalyticsCustomReportDto,
  AnalyticsExportDto,
  AnalyticsQueryDto,
  AnalyticsRefreshDto,
  StatutoryReportRunDto,
} from '../dto/analytics.dto';

export type AnalyticsSourceDefinition = {
  code: string;
  sourceModule: string;
  sourceTable: string;
  primaryKey: string;
  companyColumn: string;
  updatedAtColumn?: string;
  deletionColumn?: string;
  refreshMode: AnalyticsRefreshModeEnum;
  sensitivity: AnalyticsSensitivityEnum;
  dimensions: string[];
  measures: string[];
};

type MetricValue = {
  code: string;
  value: string | number;
  definition: Record<string, unknown>;
};

type MetricDefinitionSeed = Partial<AnalyticsMetricDefinition> &
  Pick<AnalyticsMetricDefinition, 'code' | 'datasetCode'>;

type AnalyticsIssue = Record<string, unknown> & { code: string };

type RiskIndicator = {
  code: string;
  severity?: string;
  explanation: string;
};

type AnalyticsResolvedScope = {
  companyId: number;
  employeeIds: number[] | null;
  branchId: number | null;
  departmentId: number | null;
  employeeId: number | null;
  scopeHash: string;
};

type AnalyticsScopeSqlOptions = {
  employeeColumn: string;
  branchColumn?: string;
  departmentColumn?: string;
};

type AnalyticsQueryRow = Record<string, unknown>;

type SqlDateValue = string | Date;

type SqlMoneyValue = string | number | null;

type CompanyRow = {
  id: number;
};

type EmployeeHistorySourceRow = {
  id: number;
  employee_no: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  primary_branch_id: number | null;
  primary_department_id: number | null;
  primary_position_id: number | null;
  grade_id: number | null;
  cost_center_id: number | null;
  reports_to: number | null;
  employment_status: string | null;
  employment_type: string | null;
  effective_from: SqlDateValue;
};

type WorkforceEmployeeRow = EmployeeHistorySourceRow & {
  hire_date: SqlDateValue | null;
  created_at: SqlDateValue;
  exit_date: SqlDateValue | null;
  probation_end_date: string | null;
  confirmation_date: string | null;
};

type AttendanceSummaryRow = {
  employee_id: number;
  attendance_date: SqlDateValue;
  branch_id: number | null;
  attendance_status: string | null;
  work_minutes: number | null;
  late_minutes: number | null;
  check_in_at: SqlDateValue | null;
  check_out_at: SqlDateValue | null;
  finalized_at: SqlDateValue;
};

type PayrollResultRow = {
  id: number;
  employee_id: number;
  payroll_run_id: number;
  payroll_period_id: number;
  gross_pay: SqlMoneyValue;
  net_pay: SqlMoneyValue;
  employee_deductions: SqlMoneyValue;
  employer_cost: SqlMoneyValue;
  currency: string | null;
  calculation_hash: string;
};

type EmployeeFinanceAccountRow = {
  id: number;
  employee_id: number;
  product_type: string;
  disbursed_at: SqlDateValue | null;
  principal_amount: SqlMoneyValue;
  total_payable: SqlMoneyValue;
  outstanding_total: SqlMoneyValue;
  status: string | null;
};

type GenericApprovalFactRow = {
  id: number;
  assignee_employee_id: number | null;
  created_at: SqlDateValue;
  action_type: string | null;
  status: string | null;
};

type WorkforceSummaryRow = {
  period_end_headcount: unknown;
  joiners: unknown;
  exits: unknown;
};

type AttendanceSummaryAggregateRow = {
  days: unknown;
  work_minutes: unknown;
  late_days: unknown;
  missing_punch_days: unknown;
};

type LeaveSummaryRow = {
  approved_requests: unknown;
  approved_days: unknown;
};

type PayrollAggregateRow = {
  locked_runs: unknown;
  gross_pay: SqlMoneyValue;
  net_pay: SqlMoneyValue;
  employer_cost: SqlMoneyValue;
};

type FinanceAggregateRow = {
  product_type: string | null;
  closing_balance: SqlMoneyValue;
  arrears: SqlMoneyValue;
};

type PerformanceSummaryRow = {
  published_reviews: unknown;
  average_score: unknown;
};

type CountRow = {
  approved_reports?: unknown;
  reviewed_visits?: unknown;
  pending_actions?: unknown;
};

type PayrollReconciliationRow = {
  id: number;
  gross_total: SqlMoneyValue;
  net_pay_total: SqlMoneyValue;
  analytics_gross: SqlMoneyValue;
  analytics_net: SqlMoneyValue;
};

type EmployeeFinanceReconciliationRow = {
  id: number;
  outstanding_total: SqlMoneyValue;
  ledger_balance: SqlMoneyValue;
};

type StatutoryPayrollTotalsRow = {
  gross_pay: SqlMoneyValue;
  deductions: SqlMoneyValue;
  net_pay: SqlMoneyValue;
};

type AnalyticsRiskSummary = {
  attendance?: { late_rate?: unknown };
  payroll?: {
    locked_runs?: unknown;
    gross_pay?: unknown;
    net_pay?: unknown;
    employer_cost?: unknown;
  };
  finance?: { arrears_ratio?: unknown };
  approvals?: { pending_actions?: unknown };
};

async function queryRows<T extends AnalyticsQueryRow>(
  dataSource: Pick<DataSource, 'query'>,
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  return await dataSource.query(sql, params);
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function dateKey(date: string) {
  return Number(date.replace(/-/g, ''));
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.floor((end - start) / 86400000);
}

function monthsBetween(from: string | null, to: string) {
  if (!from) return 0;
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  return Math.max(
    0,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth()),
  );
}

function numberFrom(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sqlDateOrNull(value: SqlDateValue | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function sqlMoneyString(value: SqlMoneyValue) {
  return value === null || value === undefined || value === ''
    ? '0.00'
    : String(value);
}

function defaultRange(query: AnalyticsQueryDto) {
  const end = query.date_to ?? todayString();
  return {
    dateFrom: query.date_from ?? monthStart(end),
    dateTo: end,
  };
}

function employeeLookupCondition(employeeColumn: string, predicate: string) {
  return `EXISTS (
    SELECT 1 FROM employees scope_employee
    WHERE scope_employee.id = ${employeeColumn}
      AND scope_employee.company_id = $1
      AND ${predicate}
  )`;
}

function scopeSql(
  scope: AnalyticsResolvedScope,
  params: unknown[],
  options: AnalyticsScopeSqlOptions,
) {
  const conditions: string[] = [];

  if (scope.employeeIds !== null) {
    params.push(scope.employeeIds);
    conditions.push(
      `${options.employeeColumn} = ANY($${params.length}::int[])`,
    );
  }

  if (scope.employeeId) {
    params.push(scope.employeeId);
    conditions.push(`${options.employeeColumn} = $${params.length}`);
  }

  if (scope.branchId) {
    params.push(scope.branchId);
    conditions.push(
      options.branchColumn
        ? `${options.branchColumn} = $${params.length}`
        : employeeLookupCondition(
            options.employeeColumn,
            `scope_employee.primary_branch_id = $${params.length}`,
          ),
    );
  }

  if (scope.departmentId) {
    params.push(scope.departmentId);
    conditions.push(
      options.departmentColumn
        ? `${options.departmentColumn} = $${params.length}`
        : employeeLookupCondition(
            options.employeeColumn,
            `scope_employee.primary_department_id = $${params.length}`,
          ),
    );
  }

  return conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return '';
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' ||
          typeof value === 'boolean' ||
          typeof value === 'bigint'
        ? String(value)
        : (JSON.stringify(value) ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serializeCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  return [
    columns.map(csvEscape).join(','),
    ...rows.map((row) =>
      columns.map((column) => csvEscape(row[column])).join(','),
    ),
  ].join('\n');
}

@Injectable()
export class AnalyticsSourceRegistryService {
  private readonly sources = new Map<string, AnalyticsSourceDefinition>();

  constructor() {
    this.registerDefaults();
  }

  register(source: AnalyticsSourceDefinition): void {
    if (this.sources.has(source.code)) {
      throw new BadRequestException(
        `Analytics source "${source.code}" is already registered.`,
      );
    }
    this.sources.set(source.code, source);
  }

  require(code: string): AnalyticsSourceDefinition {
    const source = this.sources.get(code.trim().toUpperCase());
    if (!source) {
      throw new NotFoundException(
        `Analytics source "${code}" is not registered.`,
      );
    }
    return source;
  }

  list() {
    return [...this.sources.values()];
  }

  private registerDefaults() {
    const definitions: AnalyticsSourceDefinition[] = [
      source(
        'EMPLOYEES',
        'Employee lifecycle',
        'employees',
        ['branch_id', 'department_id', 'position_id'],
        ['headcount'],
      ),
      source(
        'EMPLOYEE_ASSIGNMENT_HISTORY',
        'Employee lifecycle',
        'dim_employee_history',
        ['branch_id', 'department_id', 'position_id'],
        ['employee_count'],
      ),
      source(
        'EMPLOYEE_MOVEMENTS',
        'Employee movements',
        'employee_movements',
        ['movement_type', 'status'],
        ['movement_count'],
      ),
      source(
        'PROBATION_CASES',
        'Probation',
        'probation_cases',
        ['status'],
        ['case_count'],
      ),
      source(
        'ONBOARDING_REQUESTS',
        'Onboarding',
        'onboarding_requests',
        ['status'],
        ['request_count'],
      ),
      source(
        'OFFBOARDING_REQUESTS',
        'Offboarding',
        'offboarding_requests',
        ['status'],
        ['request_count'],
      ),
      source(
        'ATTENDANCE_DAILY_SUMMARIES',
        'Attendance',
        'attendance_daily_summaries',
        ['branch_id', 'attendance_status'],
        ['work_minutes', 'late_minutes'],
      ),
      source(
        'LEAVE_REQUESTS',
        'Leave',
        'leave_requests',
        ['leave_type_id', 'status'],
        ['total_days'],
      ),
      source(
        'LEAVE_LEDGER',
        'Leave',
        'leave_balance_transactions',
        ['leave_type_id'],
        ['days_delta'],
      ),
      source(
        'PERFORMANCE_REVIEWS',
        'Performance',
        'performance_reviews',
        ['status'],
        ['final_score'],
      ),
      source(
        'PERFORMANCE_AGGREGATES',
        'Performance',
        'performance_aggregates',
        ['period_id'],
        ['overall_score'],
      ),
      source(
        'DAILY_ACTIVITY_REPORTS',
        'Daily activities',
        'daily_activity_reports',
        ['status'],
        ['activity_count'],
      ),
      source(
        'FIELD_VISITS',
        'Field visits',
        'field_visits',
        ['status'],
        ['visit_count', 'duration_minutes'],
      ),
      source(
        'FIELD_OPPORTUNITIES',
        'Field visits',
        'field_visit_plan_items',
        ['status'],
        ['expected_value'],
      ),
      source(
        'FIELD_FOLLOW_UPS',
        'Field visits',
        'field_visit_plan_items',
        ['status'],
        ['follow_up_count'],
      ),
      source(
        'EMPLOYEE_PAYROLL_RESULTS',
        'Payroll',
        'employee_payroll_results',
        ['payroll_period_id', 'status'],
        ['gross_pay', 'net_pay'],
      ),
      source(
        'EMPLOYEE_PAYROLL_LINE_ITEMS',
        'Payroll',
        'employee_payroll_line_items',
        ['component_code'],
        ['amount'],
      ),
      source(
        'EMPLOYEE_FINANCE_ACCOUNTS',
        'Employee finance',
        'employee_finance_accounts',
        ['product_type', 'status'],
        ['outstanding_total'],
      ),
      source(
        'EMPLOYEE_FINANCE_LEDGER_ENTRIES',
        'Employee finance',
        'employee_finance_ledger_entries',
        ['entry_type'],
        ['total_amount'],
      ),
      source(
        'EMPLOYEE_FINANCE_INSTALLMENTS',
        'Employee finance',
        'employee_finance_installments',
        ['status'],
        ['total_due', 'paid_amount'],
      ),
      source(
        'WORKFLOW_ACTIONS',
        'Approvals',
        'action_items',
        ['action_type', 'status'],
        ['action_count'],
      ),
      source(
        'ACTION_ITEMS',
        'Approvals',
        'action_items',
        ['action_type', 'status'],
        ['action_count'],
      ),
    ];
    definitions.forEach((definition) => this.register(definition));
  }
}

function source(
  code: string,
  sourceModule: string,
  sourceTable: string,
  dimensions: string[],
  measures: string[],
): AnalyticsSourceDefinition {
  return {
    code,
    sourceModule,
    sourceTable,
    primaryKey: 'id',
    companyColumn: 'company_id',
    updatedAtColumn: 'updated_at',
    refreshMode: AnalyticsRefreshModeEnum.INCREMENTAL,
    sensitivity:
      code.includes('PAYROLL') || code.includes('FINANCE')
        ? AnalyticsSensitivityEnum.CONFIDENTIAL
        : AnalyticsSensitivityEnum.INTERNAL,
    dimensions,
    measures,
  };
}

@Injectable()
export class AnalyticsScopeService {
  constructor(private readonly hrAccessService: HrAccessService) {}

  async resolve(
    actor: AuthenticatedUser,
    query: AnalyticsQueryDto = {},
  ): Promise<AnalyticsResolvedScope> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    const scope = {
      companyId,
      employeeIds,
      branchId: query.branch_id ?? null,
      departmentId: query.department_id ?? null,
      employeeId: query.employee_id ?? null,
    };
    return {
      ...scope,
      scopeHash: hash(scope),
    };
  }
}

@Injectable()
export class AnalyticsPrivacyService {
  constructor(private readonly configService: ConfigService) {}

  suppressSmallCell(value: number) {
    if (
      !this.configService.get<boolean>(
        'ANALYTICS_SMALL_CELL_SUPPRESSION_ENABLED',
        true,
      )
    ) {
      return value;
    }
    const minimum = this.configService.get<number>(
      'ANALYTICS_SMALL_CELL_MINIMUM_COUNT',
      5,
    );
    return value > 0 && value < minimum ? null : value;
  }

  assertRawSqlDisabled(filters: Record<string, unknown> | undefined | null) {
    if (this.configService.get<boolean>('ANALYTICS_ALLOW_RAW_SQL', false)) {
      throw new BadRequestException(
        'Raw SQL analytics is disabled in this implementation.',
      );
    }
    const serialized = JSON.stringify(filters ?? {}).toLowerCase();
    if (/\b(select|insert|update|delete|drop|alter)\b|;|--/.test(serialized)) {
      throw new BadRequestException(
        'Raw SQL or SQL-like filters are not allowed.',
      );
    }
  }

  maskSensitiveMetric(metric: MetricValue, allowed: boolean) {
    if (allowed) return metric;
    return {
      ...metric,
      value: null,
      masked: true,
    };
  }
}

@Injectable()
export class AnalyticsCacheService {
  private readonly cache = new Map<
    string,
    { companyId: number | null; expiresAt: number; value: unknown }
  >();

  constructor(private readonly configService: ConfigService) {}

  key(parts: Record<string, unknown>) {
    return hash(parts);
  }

  get<T>(key: string): T | null {
    if (
      !this.configService.get<boolean>(
        'ANALYTICS_DASHBOARD_CACHE_ENABLED',
        true,
      )
    ) {
      return null;
    }
    const cached = this.cache.get(key);
    if (!cached || cached.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return cached.value as T;
  }

  set(
    key: string,
    value: unknown,
    ttlSeconds?: number,
    companyId?: number | null,
  ) {
    if (
      !this.configService.get<boolean>(
        'ANALYTICS_DASHBOARD_CACHE_ENABLED',
        true,
      )
    ) {
      return;
    }
    const ttl =
      ttlSeconds ??
      this.configService.get<number>(
        'ANALYTICS_DASHBOARD_CACHE_TTL_SECONDS',
        300,
      );
    this.cache.set(key, {
      companyId: companyId ?? null,
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  invalidateCompany(companyId: number) {
    for (const [key, cached] of this.cache.entries()) {
      if (cached.companyId === companyId) this.cache.delete(key);
    }
  }
}

@Injectable()
export class AnalyticsAuditService {
  constructor(
    @InjectRepository(AnalyticsAccessLog)
    private readonly repository: Repository<AnalyticsAccessLog>,
  ) {}

  log(args: {
    actor?: AuthenticatedUser;
    companyId?: number | null;
    action: string;
    resourceType: string;
    resourceCode: string;
    purpose?: string | null;
    scopeHash?: string;
    sensitivity?: AnalyticsSensitivityEnum;
    metadata?: Record<string, unknown> | null;
  }) {
    return this.repository.save(
      this.repository.create({
        companyId: args.companyId ?? args.actor?.companyId ?? null,
        actorCompanyUserId: args.actor?.companyMembershipId ?? null,
        employeeId: args.actor?.employeeId ?? null,
        action: args.action,
        resourceType: args.resourceType,
        resourceCode: args.resourceCode,
        purpose: args.purpose ?? null,
        scopeHash:
          args.scopeHash ??
          hash({ companyId: args.companyId ?? args.actor?.companyId ?? null }),
        sensitivity: args.sensitivity ?? AnalyticsSensitivityEnum.INTERNAL,
        metadata: args.metadata ?? null,
      }),
    );
  }
}

@Injectable()
export class AnalyticsDatasetService {
  constructor(
    private readonly sourceRegistry: AnalyticsSourceRegistryService,
    @InjectRepository(AnalyticsDataset)
    private readonly repository: Repository<AnalyticsDataset>,
  ) {}

  async bootstrapCatalog() {
    const saved: AnalyticsDataset[] = [];
    for (const sourceDefinition of this.sourceRegistry.list()) {
      const existing = await this.repository.findOne({
        where: { companyId: IsNull(), code: sourceDefinition.code },
      });
      const dataset =
        existing ??
        this.repository.create({
          companyId: null,
          code: sourceDefinition.code,
        });
      dataset.name = sourceDefinition.sourceModule;
      dataset.datasetType = sourceDefinition.sourceTable.startsWith('dim_')
        ? AnalyticsDatasetTypeEnum.DIMENSION
        : AnalyticsDatasetTypeEnum.FACT;
      dataset.sourceCode = sourceDefinition.code;
      dataset.physicalName = sourceDefinition.sourceTable;
      dataset.refreshMode = sourceDefinition.refreshMode;
      dataset.sensitivity = sourceDefinition.sensitivity;
      dataset.allowedDimensions = sourceDefinition.dimensions;
      dataset.allowedMeasures = sourceDefinition.measures;
      dataset.refreshConfiguration = {
        source_table: sourceDefinition.sourceTable,
      };
      dataset.status = 'ACTIVE';
      saved.push(await this.repository.save(dataset));
    }
    return saved;
  }

  async list() {
    await this.bootstrapCatalog();
    return this.repository.find({ order: { code: 'ASC' } });
  }

  async requireDataset(code: string) {
    await this.bootstrapCatalog();
    const dataset = await this.repository.findOne({
      where: [{ companyId: IsNull(), code: code.trim().toUpperCase() }],
    });
    if (!dataset) throw new NotFoundException('Analytics dataset not found.');
    return dataset;
  }
}

@Injectable()
export class AnalyticsMetricService {
  constructor(
    private readonly datasetService: AnalyticsDatasetService,
    @InjectRepository(AnalyticsMetricDefinition)
    private readonly repository: Repository<AnalyticsMetricDefinition>,
  ) {}

  async bootstrapMetricCatalog() {
    const definitions: MetricDefinitionSeed[] = [
      metric(
        'PERIOD_END_HEADCOUNT',
        'Period-end headcount',
        'EMPLOYEES',
        AnalyticsAggregationEnum.DISTINCT_COUNT,
        'PERIOD_END_HEADCOUNT',
        ['branch_id', 'department_id'],
        ['employment_status=active'],
      ),
      metric(
        'JOINERS',
        'Joiners',
        'EMPLOYEES',
        AnalyticsAggregationEnum.COUNT,
        'COUNT_RECORDS',
        ['branch_id', 'department_id'],
        ['hire_date in period'],
      ),
      metric(
        'EXITS',
        'Exits',
        'EMPLOYEES',
        AnalyticsAggregationEnum.COUNT,
        'COUNT_RECORDS',
        ['branch_id', 'department_id'],
        ['exit_date in period'],
      ),
      metric(
        'ATTENDANCE_LATE_RATE',
        'Late attendance rate',
        'ATTENDANCE_DAILY_SUMMARIES',
        AnalyticsAggregationEnum.PERCENTAGE,
        'NUMERATOR_DIVIDED_BY_DENOMINATOR',
        ['branch_id'],
        ['finalized summaries only'],
      ),
      metric(
        'PAYROLL_NET_PAY',
        'Locked payroll net pay',
        'EMPLOYEE_PAYROLL_RESULTS',
        AnalyticsAggregationEnum.SUM,
        'SUM_MEASURE',
        ['payroll_period_id'],
        ['locked payroll only'],
      ),
      metric(
        'LOAN_OUTSTANDING',
        'Employee finance outstanding',
        'EMPLOYEE_FINANCE_ACCOUNTS',
        AnalyticsAggregationEnum.SUM,
        'SUM_MEASURE',
        ['product_type'],
        ['active loan and advance accounts'],
      ),
      metric(
        'APPROVAL_PENDING',
        'Pending approval actions',
        'ACTION_ITEMS',
        AnalyticsAggregationEnum.COUNT,
        'COUNT_RECORDS',
        ['action_type', 'status'],
        ['open action items'],
      ),
    ];
    const saved: AnalyticsMetricDefinition[] = [];
    for (const definition of definitions) {
      await this.datasetService.requireDataset(definition.datasetCode);
      const existing = await this.repository.findOne({
        where: { companyId: IsNull(), code: definition.code, versionNumber: 1 },
      });
      const item =
        existing ??
        this.repository.create({
          companyId: null,
          code: definition.code,
          versionNumber: 1,
        });
      Object.assign(item, definition, {
        definitionHash: hash(definition),
        effectiveFrom: '2020-01-01',
        effectiveTo: null,
        isLocked: true,
        approvedByCompanyUserId: null,
        approvedAt: null,
        status: 'APPROVED',
      });
      saved.push(await this.repository.save(item));
    }
    return saved;
  }

  async list() {
    await this.bootstrapMetricCatalog();
    return this.repository.find({
      order: { code: 'ASC', versionNumber: 'DESC' },
    });
  }

  async requireMetric(code: string) {
    await this.bootstrapMetricCatalog();
    const metricDefinition = await this.repository.findOne({
      where: {
        companyId: IsNull(),
        code: code.trim().toUpperCase(),
        status: 'APPROVED',
      },
      order: { versionNumber: 'DESC' },
    });
    if (!metricDefinition)
      throw new NotFoundException('Analytics metric not found.');
    return metricDefinition;
  }
}

function metric(
  code: string,
  name: string,
  datasetCode: string,
  aggregation: AnalyticsAggregationEnum,
  formulaCode: string,
  allowedDimensions: string[],
  exclusions: string[],
): MetricDefinitionSeed {
  return {
    code,
    name,
    description: `${name}. Formula: ${formulaCode}. Population/exclusions: ${exclusions.join('; ')}.`,
    datasetCode,
    aggregation,
    formulaCode,
    formulaConfiguration: { exclusions },
    defaultTimeGrain: AnalyticsTimeGrainEnum.MONTHLY,
    allowedDimensions,
    defaultFilters: null,
    exclusionRules: { exclusions },
    roundingScale: 2,
    sensitivity:
      datasetCode.includes('PAYROLL') || datasetCode.includes('FINANCE')
        ? AnalyticsSensitivityEnum.CONFIDENTIAL
        : AnalyticsSensitivityEnum.INTERNAL,
  };
}

@Injectable()
export class AnalyticsDimensionService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(AnalyticsDateDimension)
    private readonly dateRepository: Repository<AnalyticsDateDimension>,
    @InjectRepository(AnalyticsEmployeeHistoryDimension)
    private readonly employeeHistoryRepository: Repository<AnalyticsEmployeeHistoryDimension>,
  ) {}

  async ensureDateDimension(from = '2020-01-01', to = '2040-12-31') {
    const rows: AnalyticsDateDimension[] = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const parsed = new Date(`${date}T00:00:00.000Z`);
      rows.push(
        this.dateRepository.create({
          dateKey: dateKey(date),
          calendarDate: date,
          calendarYear: parsed.getUTCFullYear(),
          calendarQuarter: Math.floor(parsed.getUTCMonth() / 3) + 1,
          calendarMonth: parsed.getUTCMonth() + 1,
          monthName: parsed.toLocaleString('en-US', {
            month: 'long',
            timeZone: 'UTC',
          }),
          weekOfYear: Math.ceil(
            ((parsed.getTime() - Date.UTC(parsed.getUTCFullYear(), 0, 1)) /
              86400000 +
              1) /
              7,
          ),
          dayOfMonth: parsed.getUTCDate(),
          dayOfWeek: parsed.getUTCDay(),
          isWeekend: [0, 6].includes(parsed.getUTCDay()),
          financialYearCode: `FY${parsed.getUTCFullYear()}`,
        }),
      );
    }
    for (let index = 0; index < rows.length; index += 500) {
      await this.dateRepository.upsert(rows.slice(index, index + 500), [
        'dateKey',
      ]);
    }
    return { inserted_or_updated: rows.length };
  }

  async rebuildEmployeeHistory(companyId: number) {
    const employees = await queryRows<EmployeeHistorySourceRow>(
      this.dataSource,
      `SELECT id, employee_no, first_name, middle_name, last_name, primary_branch_id,
        primary_department_id, primary_position_id, grade_id, cost_center_id, reports_to,
        employment_status, employment_type, COALESCE(hire_date, created_at::date) AS effective_from
       FROM employees WHERE company_id = $1`,
      [companyId],
    );
    let changed = 0;
    for (const employee of employees) {
      const snapshot = {
        employee_no: employee.employee_no,
        branch_id: employee.primary_branch_id,
        department_id: employee.primary_department_id,
        position_id: employee.primary_position_id,
        grade_id: employee.grade_id,
        cost_center_id: employee.cost_center_id,
        manager_employee_id: employee.reports_to,
        employment_status: employee.employment_status,
        employment_type: employee.employment_type,
      };
      const sourceHash = hash(snapshot);
      const current = await this.employeeHistoryRepository.findOne({
        where: { companyId, employeeId: employee.id, isCurrent: true },
      });
      if (current?.sourceHash === sourceHash) continue;
      if (current) {
        current.isCurrent = false;
        current.effectiveTo = addDays(todayString(), -1);
        await this.employeeHistoryRepository.save(current);
      }
      const nextHistory: DeepPartial<AnalyticsEmployeeHistoryDimension> = {
        companyId,
        employeeId: employee.id,
        employeeNo: employee.employee_no ?? String(employee.id),
        fullName:
          [employee.first_name, employee.middle_name, employee.last_name]
            .filter(Boolean)
            .join(' ') || `Employee ${employee.id}`,
        branchId: employee.primary_branch_id,
        departmentId: employee.primary_department_id,
        positionId: employee.primary_position_id,
        gradeId: employee.grade_id,
        costCenterId: employee.cost_center_id,
        managerEmployeeId: employee.reports_to,
        employmentStatus: employee.employment_status ?? 'UNKNOWN',
        employmentType: employee.employment_type,
        effectiveFrom: String(employee.effective_from).slice(0, 10),
        effectiveTo: null,
        isCurrent: true,
        sourceHash,
      };
      await this.employeeHistoryRepository.save(nextHistory);
      changed += 1;
    }
    return { source_count: employees.length, changed };
  }
}

@Injectable()
export class AnalyticsSnapshotService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly dimensionService: AnalyticsDimensionService,
    private readonly datasetService: AnalyticsDatasetService,
    private readonly cacheService: AnalyticsCacheService,
    @InjectRepository(AnalyticsSnapshotRun)
    private readonly runRepository: Repository<AnalyticsSnapshotRun>,
    @InjectRepository(AnalyticsWorkforceDailyFact)
    private readonly workforceRepository: Repository<AnalyticsWorkforceDailyFact>,
    @InjectRepository(AnalyticsAttendanceDailyFact)
    private readonly attendanceRepository: Repository<AnalyticsAttendanceDailyFact>,
    @InjectRepository(AnalyticsPayrollEmployeePeriodFact)
    private readonly payrollRepository: Repository<AnalyticsPayrollEmployeePeriodFact>,
    @InjectRepository(AnalyticsEmployeeFinanceMonthlyFact)
    private readonly financeRepository: Repository<AnalyticsEmployeeFinanceMonthlyFact>,
    @InjectRepository(AnalyticsGenericFact)
    private readonly genericRepository: Repository<AnalyticsGenericFact>,
    @InjectRepository(AnalyticsEmployeeHistoryDimension)
    private readonly employeeHistoryRepository: Repository<AnalyticsEmployeeHistoryDimension>,
    @InjectRepository(AnalyticsRefreshCheckpoint)
    private readonly checkpointRepository: Repository<AnalyticsRefreshCheckpoint>,
  ) {}

  @Cron(process.env.ANALYTICS_DAILY_SNAPSHOT_CRON || '0 15 1 * * *')
  async scheduledDailySnapshot() {
    if (process.env.ANALYTICS_ENABLED === 'false') return null;
    return this.refreshCompany(null, { refresh_mode: 'INCREMENTAL' });
  }

  async refresh(actor: AuthenticatedUser, dto: AnalyticsRefreshDto) {
    return this.refreshCompany(actor.companyId!, dto);
  }

  async refreshCompany(companyId: number | null, dto: AnalyticsRefreshDto) {
    await this.datasetService.bootstrapCatalog();
    await this.dimensionService.ensureDateDimension();
    const companies = companyId
      ? [{ id: companyId }]
      : await queryRows<CompanyRow>(
          this.dataSource,
          `SELECT id FROM companies WHERE status = 'active'`,
        );
    const results: Array<{
      run_id: string;
      dataset_code: string;
      source_count: number;
      upserted: number;
    }> = [];
    for (const company of companies) {
      await this.dimensionService.rebuildEmployeeHistory(company.id);
      const range = defaultRange(dto);
      const codes = dto.dataset_code
        ? [dto.dataset_code.toUpperCase()]
        : [
            'WORKFORCE_DAILY',
            'ATTENDANCE_DAILY',
            'PAYROLL_EMPLOYEE_PERIOD',
            'EMPLOYEE_FINANCE_MONTHLY',
            'APPROVAL_SLA',
          ];
      for (const code of codes) {
        results.push(
          await this.refreshDataset(
            company.id,
            code,
            range.dateFrom,
            range.dateTo,
            dto.refresh_mode,
          ),
        );
      }
      this.cacheService.invalidateCompany(company.id);
    }
    return results;
  }

  private async refreshDataset(
    companyId: number,
    datasetCode: string,
    dateFrom: string,
    dateTo: string,
    mode = 'INCREMENTAL',
  ) {
    const run = await this.startRun(
      companyId,
      datasetCode,
      dateFrom,
      dateTo,
      mode,
    );
    try {
      const result =
        datasetCode === 'WORKFORCE_DAILY'
          ? await this.loadWorkforce(companyId, dateFrom, dateTo, run)
          : datasetCode === 'ATTENDANCE_DAILY'
            ? await this.loadAttendance(companyId, dateFrom, dateTo, run)
            : datasetCode === 'PAYROLL_EMPLOYEE_PERIOD'
              ? await this.loadPayroll(companyId, run)
              : datasetCode === 'EMPLOYEE_FINANCE_MONTHLY'
                ? await this.loadEmployeeFinance(
                    companyId,
                    dateFrom,
                    dateTo,
                    run,
                  )
                : await this.loadGenericApprovalFacts(
                    companyId,
                    dateFrom,
                    dateTo,
                    run,
                  );
      run.status = AnalyticsSnapshotStatusEnum.COMPLETED;
      run.completedAt = new Date();
      run.sourceRecordCount = String(result.source_count);
      run.insertedRecordCount = String(result.upserted);
      run.outputHash = hash(result);
      await this.runRepository.save(run);
      await this.upsertCheckpoint(companyId, datasetCode, run.id);
      return { ...result, run_id: run.id, dataset_code: datasetCode };
    } catch (error) {
      run.status = AnalyticsSnapshotStatusEnum.FAILED;
      run.completedAt = new Date();
      run.errors = [
        { message: error instanceof Error ? error.message : 'Unknown error' },
      ];
      await this.runRepository.save(run);
      throw error;
    }
  }

  private async startRun(
    companyId: number,
    datasetCode: string,
    dateFrom: string,
    dateTo: string,
    mode: string,
  ) {
    return this.runRepository.save(
      this.runRepository.create({
        companyId,
        runNo: `AN-${companyId}-${datasetCode}-${Date.now()}`,
        datasetCode,
        refreshMode: mode as AnalyticsRefreshModeEnum,
        dateFrom,
        dateTo,
        status: AnalyticsSnapshotStatusEnum.RUNNING,
        startedAt: new Date(),
        completedAt: null,
        warnings: null,
        errors: null,
      }),
    );
  }

  private async loadWorkforce(
    companyId: number,
    dateFrom: string,
    dateTo: string,
    run: AnalyticsSnapshotRun,
  ) {
    const employees = await queryRows<WorkforceEmployeeRow>(
      this.dataSource,
      `SELECT * FROM employees WHERE company_id = $1 AND COALESCE(hire_date, created_at::date) <= $2`,
      [companyId, dateTo],
    );
    const facts: AnalyticsWorkforceDailyFact[] = [];
    for (let date = dateFrom; date <= dateTo; date = addDays(date, 1)) {
      for (const employee of employees) {
        const hireDate = String(
          employee.hire_date ?? employee.created_at,
        ).slice(0, 10);
        const exitDate = employee.exit_date
          ? String(employee.exit_date).slice(0, 10)
          : null;
        if (hireDate > date || (exitDate && exitDate < date)) continue;
        const dimension = await this.employeeHistoryRepository.findOne({
          where: { companyId, employeeId: employee.id, isCurrent: true },
        });
        if (!dimension) continue;
        const snapshot = {
          employee_id: employee.id,
          date,
          branch_id: employee.primary_branch_id,
          department_id: employee.primary_department_id,
          status: employee.employment_status,
        };
        facts.push(
          this.workforceRepository.create({
            companyId,
            employeeId: employee.id,
            employeeDimensionId: dimension.id,
            snapshotDate: date,
            dateKey: dateKey(date),
            branchId: employee.primary_branch_id,
            departmentId: employee.primary_department_id,
            positionId: employee.primary_position_id,
            gradeId: employee.grade_id,
            costCenterId: employee.cost_center_id,
            managerEmployeeId: employee.reports_to,
            isActiveHeadcount: employee.employment_status === 'active',
            isProbation: Boolean(
              employee.probation_end_date &&
              employee.probation_end_date >= date,
            ),
            isConfirmed: Boolean(
              employee.confirmation_date && employee.confirmation_date <= date,
            ),
            isNewJoiner:
              hireDate >= dateFrom && hireDate <= dateTo && hireDate === date,
            isExit: exitDate === date,
            serviceMonths: monthsBetween(hireDate, date),
            sourceSnapshotHash: hash(snapshot),
            snapshotRunId: run.id,
          }),
        );
      }
    }
    await this.workforceRepository.upsert(facts, [
      'companyId',
      'employeeId',
      'snapshotDate',
    ]);
    return { source_count: employees.length, upserted: facts.length };
  }

  private async loadAttendance(
    companyId: number,
    dateFrom: string,
    dateTo: string,
    run: AnalyticsSnapshotRun,
  ) {
    const rows = await queryRows<AttendanceSummaryRow>(
      this.dataSource,
      `SELECT * FROM attendance_daily_summaries
       WHERE company_id = $1 AND attendance_date BETWEEN $2 AND $3 AND finalized_at IS NOT NULL`,
      [companyId, dateFrom, dateTo],
    );
    const facts: DeepPartial<AnalyticsAttendanceDailyFact>[] = rows.map(
      (row) => ({
        companyId,
        employeeId: row.employee_id,
        attendanceDate: String(row.attendance_date).slice(0, 10),
        dateKey: dateKey(String(row.attendance_date).slice(0, 10)),
        branchId: row.branch_id,
        status: row.attendance_status ?? 'UNKNOWN',
        workMinutes: row.work_minutes ?? 0,
        lateMinutes: row.late_minutes ?? 0,
        missingPunchCount:
          (row.check_in_at ? 0 : 1) + (row.check_out_at ? 0 : 1),
        finalizedAt: sqlDateOrNull(row.finalized_at),
        sourceSnapshotHash: hash(row),
        snapshotRunId: run.id,
      }),
    );
    await this.attendanceRepository.upsert(facts, [
      'companyId',
      'employeeId',
      'attendanceDate',
    ]);
    return { source_count: rows.length, upserted: facts.length };
  }

  private async loadPayroll(companyId: number, run: AnalyticsSnapshotRun) {
    const rows = await queryRows<PayrollResultRow>(
      this.dataSource,
      `SELECT result.*, profile.currency
       FROM employee_payroll_results result
       JOIN payroll_runs payroll_run ON payroll_run.id = result.payroll_run_id
       LEFT JOIN employee_payroll_profiles profile ON profile.employee_id = result.employee_id AND profile.company_id = result.company_id
       WHERE result.company_id = $1 AND payroll_run.status = 'LOCKED' AND result.status = 'LOCKED'`,
      [companyId],
    );
    const facts: DeepPartial<AnalyticsPayrollEmployeePeriodFact>[] = rows.map(
      (row) => ({
        companyId,
        employeeId: row.employee_id,
        payrollRunId: row.payroll_run_id,
        payrollPeriodId: row.payroll_period_id,
        payrollResultId: row.id,
        grossPay: sqlMoneyString(row.gross_pay),
        netPay: sqlMoneyString(row.net_pay),
        employeeDeductions: sqlMoneyString(row.employee_deductions),
        totalEmployerCost: sqlMoneyString(row.employer_cost),
        currency: row.currency ?? 'TZS',
        sourceSnapshotHash: row.calculation_hash,
        snapshotRunId: run.id,
      }),
    );
    await this.payrollRepository.upsert(facts, [
      'companyId',
      'payrollResultId',
    ]);
    return { source_count: rows.length, upserted: facts.length };
  }

  private async loadEmployeeFinance(
    companyId: number,
    dateFrom: string,
    dateTo: string,
    run: AnalyticsSnapshotRun,
  ) {
    const rows = await queryRows<EmployeeFinanceAccountRow>(
      this.dataSource,
      `SELECT account.*
       FROM employee_finance_accounts account
       WHERE account.company_id = $1`,
      [companyId],
    );
    const facts: DeepPartial<AnalyticsEmployeeFinanceMonthlyFact>[] = [];
    const seenMonths = new Set<string>();
    for (
      let date = monthStart(dateFrom);
      date <= dateTo;
      date = monthStart(addDays(`${date.slice(0, 7)}-28`, 5))
    ) {
      seenMonths.add(date);
    }
    for (const row of rows) {
      for (const currentMonth of seenMonths) {
        const fact: DeepPartial<AnalyticsEmployeeFinanceMonthlyFact> = {
          companyId,
          employeeId: row.employee_id,
          accountId: row.id,
          productType: row.product_type,
          monthStart: currentMonth,
          openingBalance: '0.00',
          disbursedAmount:
            row.disbursed_at &&
            String(row.disbursed_at).slice(0, 7) === currentMonth.slice(0, 7)
              ? sqlMoneyString(row.principal_amount)
              : '0.00',
          repaidAmount: EmployeeFinanceMoney.subtract(
            sqlMoneyString(row.total_payable),
            sqlMoneyString(row.outstanding_total),
          ),
          closingBalance: sqlMoneyString(row.outstanding_total),
          arrearsAmount:
            row.status === 'IN_ARREARS'
              ? sqlMoneyString(row.outstanding_total)
              : '0.00',
          snapshotRunId: run.id,
        };
        facts.push(this.financeRepository.create(fact));
      }
    }
    await this.financeRepository.upsert(facts, [
      'companyId',
      'accountId',
      'monthStart',
    ]);
    return { source_count: rows.length, upserted: facts.length };
  }

  private async loadGenericApprovalFacts(
    companyId: number,
    dateFrom: string,
    dateTo: string,
    run: AnalyticsSnapshotRun,
  ) {
    const rows = await queryRows<GenericApprovalFactRow>(
      this.dataSource,
      `SELECT * FROM action_items WHERE company_id = $1 AND created_at::date BETWEEN $2 AND $3`,
      [companyId, dateFrom, dateTo],
    );
    const facts: QueryDeepPartialEntity<AnalyticsGenericFact>[] = rows.map(
      (row) => ({
        companyId,
        datasetCode: 'APPROVAL_SLA',
        sourceId: String(row.id),
        employeeId: row.assignee_employee_id ?? null,
        factDate: String(row.created_at).slice(0, 10),
        dateKey: dateKey(String(row.created_at).slice(0, 10)),
        dimensions: {
          action_type: row.action_type,
          status: row.status,
        } as QueryDeepPartialEntity<Record<string, unknown>>,
        measures: {
          action_count: 1,
          age_hours: 0,
        } as QueryDeepPartialEntity<Record<string, unknown>>,
        sourceSnapshotHash: hash(row),
        snapshotRunId: run.id,
      }),
    );
    await this.genericRepository.upsert(facts, [
      'companyId',
      'datasetCode',
      'sourceId',
    ]);
    return { source_count: rows.length, upserted: facts.length };
  }

  private async upsertCheckpoint(
    companyId: number,
    datasetCode: string,
    runId: string,
  ) {
    const checkpoint =
      (await this.checkpointRepository.findOne({
        where: { companyId, datasetCode },
      })) ?? this.checkpointRepository.create({ companyId, datasetCode });
    checkpoint.lastSuccessfulRefreshAt = new Date();
    checkpoint.lastRunId = runId;
    checkpoint.lastSourceCursor = new Date().toISOString();
    checkpoint.metadata = { updated_by: 'analytics_refresh' };
    return this.checkpointRepository.save(checkpoint);
  }
}

@Injectable()
export class AnalyticsFreshnessService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AnalyticsRefreshCheckpoint)
    private readonly checkpointRepository: Repository<AnalyticsRefreshCheckpoint>,
  ) {}

  async freshness(companyId: number, datasetCode?: string) {
    const where: Record<string, unknown> = { companyId };
    if (datasetCode) where.datasetCode = datasetCode;
    const checkpoints = await this.checkpointRepository.find({ where });
    const warning = this.configService.get<number>(
      'ANALYTICS_DATA_FRESHNESS_WARNING_MINUTES',
      30,
    );
    const critical = this.configService.get<number>(
      'ANALYTICS_DATA_FRESHNESS_CRITICAL_MINUTES',
      120,
    );
    return checkpoints.map((checkpoint) => {
      const ageMinutes = checkpoint.lastSuccessfulRefreshAt
        ? Math.floor(
            (Date.now() - checkpoint.lastSuccessfulRefreshAt.getTime()) / 60000,
          )
        : null;
      return {
        dataset_code: checkpoint.datasetCode,
        last_successful_refresh_at: checkpoint.lastSuccessfulRefreshAt,
        age_minutes: ageMinutes,
        status:
          ageMinutes === null
            ? 'UNKNOWN'
            : ageMinutes >= critical
              ? 'CRITICAL'
              : ageMinutes >= warning
                ? 'WARNING'
                : 'FRESH',
      };
    });
  }
}

@Injectable()
export class AnalyticsDashboardService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly scopeService: AnalyticsScopeService,
    private readonly privacyService: AnalyticsPrivacyService,
    private readonly cacheService: AnalyticsCacheService,
    private readonly auditService: AnalyticsAuditService,
    private readonly freshnessService: AnalyticsFreshnessService,
  ) {}

  async hrDashboard(actor: AuthenticatedUser, query: AnalyticsQueryDto) {
    return this.dashboard(actor, query, 'HR');
  }

  async managementDashboard(
    actor: AuthenticatedUser,
    query: AnalyticsQueryDto,
  ) {
    return this.dashboard(actor, query, 'MANAGEMENT');
  }

  async managerDashboard(actor: AuthenticatedUser, query: AnalyticsQueryDto) {
    return this.dashboard(actor, query, 'MANAGER');
  }

  async salesFieldDashboard(
    actor: AuthenticatedUser,
    query: AnalyticsQueryDto,
  ) {
    return this.dashboard(actor, query, 'SALES_FIELD');
  }

  async dashboard(
    actor: AuthenticatedUser,
    query: AnalyticsQueryDto,
    audience: string,
  ) {
    const scope = await this.scopeService.resolve(actor, query);
    const range = defaultRange(query);
    this.assertDateRange(range.dateFrom, range.dateTo);
    const cacheKey = this.cacheService.key({
      companyId: scope.companyId,
      scopeHash: scope.scopeHash,
      audience,
      range,
      branchId: query.branch_id,
      departmentId: query.department_id,
      metricVersion: 1,
    });
    const cached = this.cacheService.get(cacheKey);
    if (cached) return cached;
    const [
      workforce,
      attendance,
      leave,
      payroll,
      finance,
      performance,
      activities,
      approvals,
      freshness,
    ] = await Promise.all([
      this.workforce(scope, range),
      this.attendance(scope, range),
      this.leave(scope, range),
      this.payroll(scope),
      this.finance(scope, range),
      this.performance(scope, range),
      this.activities(scope, range),
      this.approvals(scope),
      this.freshnessService.freshness(scope.companyId),
    ]);
    const response = {
      generated_at: new Date().toISOString(),
      audience,
      period: range,
      freshness,
      workforce,
      attendance,
      leave,
      payroll,
      employee_finance: finance,
      performance,
      activities,
      approvals,
      risk_indicators: this.riskIndicators({
        attendance,
        payroll,
        finance,
        approvals,
      }),
      cache: { key: cacheKey, ttl_seconds: 300 },
    };
    await this.auditService.log({
      actor,
      action: 'analytics.dashboard.viewed',
      resourceType: 'DASHBOARD',
      resourceCode: audience,
      purpose: query.purpose ?? null,
      scopeHash: scope.scopeHash,
      sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    });
    this.cacheService.set(cacheKey, response, undefined, scope.companyId);
    return response;
  }

  private assertDateRange(dateFrom: string, dateTo: string) {
    if (daysBetween(dateFrom, dateTo) > 1095) {
      throw new BadRequestException(
        'Analytics query date range exceeds 1095 days.',
      );
    }
  }

  private async workforce(
    scope: AnalyticsResolvedScope,
    range: { dateFrom: string; dateTo: string },
  ) {
    const params: unknown[] = [scope.companyId, range.dateFrom, range.dateTo];
    const scopedWhere = scopeSql(scope, params, {
      employeeColumn: 'employee_id',
      branchColumn: 'branch_id',
      departmentColumn: 'department_id',
    });
    const result = await queryRows<WorkforceSummaryRow>(
      this.dataSource,
      `SELECT
        COUNT(DISTINCT employee_id) FILTER (WHERE is_active_headcount = true AND snapshot_date = $3) AS period_end_headcount,
        COUNT(DISTINCT employee_id) FILTER (WHERE is_new_joiner = true) AS joiners,
        COUNT(DISTINCT employee_id) FILTER (WHERE is_exit = true) AS exits,
        AVG(CASE WHEN is_active_headcount THEN 1 ELSE 0 END) AS daily_average_headcount
       FROM analytics.fact_workforce_daily
       WHERE company_id = $1 AND snapshot_date BETWEEN $2 AND $3${scopedWhere}`,
      params,
    );
    const row = result[0] ?? {};
    const headcount = numberFrom(row.period_end_headcount);
    const exits = numberFrom(row.exits);
    return {
      period_end_headcount: this.privacyService.suppressSmallCell(headcount),
      joiners: numberFrom(row.joiners),
      exits,
      attrition_rate:
        headcount > 0 ? Number(((exits / headcount) * 100).toFixed(2)) : 0,
      metric_definitions: [
        'PERIOD_END_HEADCOUNT: distinct active employees on date_to using workforce snapshot',
        'ATTRITION_RATE: exits / period-end headcount * 100',
      ],
    };
  }

  private async attendance(
    scope: AnalyticsResolvedScope,
    range: { dateFrom: string; dateTo: string },
  ) {
    const params: unknown[] = [scope.companyId, range.dateFrom, range.dateTo];
    const scopedWhere = scopeSql(scope, params, {
      employeeColumn: 'employee_id',
      branchColumn: 'branch_id',
    });
    const result = await queryRows<AttendanceSummaryAggregateRow>(
      this.dataSource,
      `SELECT COUNT(*) AS days, SUM(work_minutes) AS work_minutes, SUM(late_minutes) AS late_minutes,
        COUNT(*) FILTER (WHERE late_minutes > 0) AS late_days,
        COUNT(*) FILTER (WHERE missing_punch_count > 0) AS missing_punch_days
       FROM analytics.fact_attendance_daily
       WHERE company_id = $1 AND attendance_date BETWEEN $2 AND $3${scopedWhere}`,
      params,
    );
    const row = result[0] ?? {};
    const days = numberFrom(row.days);
    return {
      finalized_days: days,
      work_minutes: numberFrom(row.work_minutes),
      late_rate:
        days > 0
          ? Number(((numberFrom(row.late_days) / days) * 100).toFixed(2))
          : 0,
      missing_punch_days: numberFrom(row.missing_punch_days),
    };
  }

  private async leave(
    scope: AnalyticsResolvedScope,
    range: { dateFrom: string; dateTo: string },
  ) {
    const params: unknown[] = [scope.companyId, range.dateFrom, range.dateTo];
    const scopedWhere = scopeSql(scope, params, {
      employeeColumn: 'request.employee_id',
    });
    const result = await queryRows<LeaveSummaryRow>(
      this.dataSource,
      `SELECT COUNT(*) AS approved_requests, COALESCE(SUM(total_days), 0) AS approved_days
       FROM leave_requests request
       WHERE request.company_id = $1 AND request.status = 'approved' AND request.start_date <= $3 AND request.end_date >= $2${scopedWhere}`,
      params,
    );
    return {
      approved_requests: numberFrom(result[0]?.approved_requests),
      approved_days: Number(numberFrom(result[0]?.approved_days).toFixed(2)),
    };
  }

  private async payroll(scope: AnalyticsResolvedScope) {
    const params: unknown[] = [scope.companyId];
    const scopedWhere = scopeSql(scope, params, {
      employeeColumn: 'employee_id',
    });
    const result = await queryRows<PayrollAggregateRow>(
      this.dataSource,
      `SELECT COUNT(DISTINCT payroll_run_id) AS locked_runs,
        COALESCE(SUM(gross_pay), 0) AS gross_pay,
        COALESCE(SUM(net_pay), 0) AS net_pay,
        COALESCE(SUM(total_employer_cost), 0) AS employer_cost
       FROM analytics.fact_payroll_employee_period WHERE company_id = $1${scopedWhere}`,
      params,
    );
    return {
      locked_runs: numberFrom(result[0]?.locked_runs),
      gross_pay: result[0]?.gross_pay ?? '0',
      net_pay: result[0]?.net_pay ?? '0',
      employer_cost: result[0]?.employer_cost ?? '0',
    };
  }

  private async finance(
    scope: AnalyticsResolvedScope,
    range: { dateFrom: string; dateTo: string },
  ) {
    const params: unknown[] = [scope.companyId, range.dateFrom, range.dateTo];
    const scopedWhere = scopeSql(scope, params, {
      employeeColumn: 'employee_id',
    });
    const result = await queryRows<FinanceAggregateRow>(
      this.dataSource,
      `SELECT product_type, COALESCE(SUM(closing_balance), 0) AS closing_balance,
        COALESCE(SUM(arrears_amount), 0) AS arrears
       FROM analytics.fact_employee_finance_monthly
       WHERE company_id = $1 AND month_start BETWEEN date_trunc('month', $2::date)::date AND date_trunc('month', $3::date)::date${scopedWhere}
       GROUP BY product_type`,
      params,
    );
    const totalOutstandingCents = result.reduce(
      (sum, row) => sum + EmployeeFinanceMoney.toCents(row.closing_balance),
      0n,
    );
    const arrearsCents = result.reduce(
      (sum, row) => sum + EmployeeFinanceMoney.toCents(row.arrears),
      0n,
    );

    return {
      by_product_type: result,
      total_outstanding: EmployeeFinanceMoney.fromCents(totalOutstandingCents),
      arrears_ratio:
        totalOutstandingCents > 0n
          ? Number(
              new Decimal(arrearsCents.toString())
                .times(100)
                .div(totalOutstandingCents.toString())
                .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
                .toString(),
            )
          : 0,
    };
  }

  private async performance(
    scope: AnalyticsResolvedScope,
    range: { dateFrom: string; dateTo: string },
  ) {
    const params: unknown[] = [scope.companyId, range.dateFrom, range.dateTo];
    const scopedWhere = scopeSql(scope, params, {
      employeeColumn: 'review.employee_id',
    });
    const result = await queryRows<PerformanceSummaryRow>(
      this.dataSource,
      `SELECT COUNT(*) AS published_reviews, COALESCE(AVG(final_score), 0) AS average_score
       FROM performance_reviews review
       WHERE review.company_id = $1 AND review.status = 'PUBLISHED' AND review.published_at::date BETWEEN $2 AND $3${scopedWhere}`,
      params,
    );
    return {
      published_reviews: numberFrom(result[0]?.published_reviews),
      average_score: Number(numberFrom(result[0]?.average_score).toFixed(2)),
    };
  }

  private async activities(
    scope: AnalyticsResolvedScope,
    range: { dateFrom: string; dateTo: string },
  ) {
    const reportParams: unknown[] = [
      scope.companyId,
      range.dateFrom,
      range.dateTo,
    ];
    const reportScopedWhere = scopeSql(scope, reportParams, {
      employeeColumn: 'report.employee_id',
    });
    const reports = await queryRows<CountRow>(
      this.dataSource,
      `SELECT COUNT(*) AS approved_reports
       FROM daily_activity_reports report
       WHERE report.company_id = $1 AND report.status IN ('APPROVED','LOCKED') AND report.activity_date BETWEEN $2 AND $3${reportScopedWhere}`,
      reportParams,
    );
    const visitParams: unknown[] = [
      scope.companyId,
      range.dateFrom,
      range.dateTo,
    ];
    const visitScopedWhere = scopeSql(scope, visitParams, {
      employeeColumn: 'visit.employee_id',
    });
    const visits = await queryRows<CountRow>(
      this.dataSource,
      `SELECT COUNT(*) AS reviewed_visits
       FROM field_visits visit
       WHERE visit.company_id = $1 AND visit.status IN ('COMPLETED','REVIEWED') AND COALESCE(visit.visit_date, visit.created_at::date) BETWEEN $2 AND $3${visitScopedWhere}`,
      visitParams,
    );
    return {
      approved_daily_reports: numberFrom(reports[0]?.approved_reports),
      reviewed_field_visits: numberFrom(visits[0]?.reviewed_visits),
    };
  }

  private async approvals(scope: AnalyticsResolvedScope) {
    const params: unknown[] = [scope.companyId];
    const scopedWhere = scopeSql(scope, params, {
      employeeColumn: 'assignee_employee_id',
      branchColumn: 'branch_id',
      departmentColumn: 'department_id',
    });
    const result = await queryRows<CountRow>(
      this.dataSource,
      `SELECT COUNT(*) AS pending_actions
       FROM action_items WHERE company_id = $1 AND status IN ('OPEN','IN_PROGRESS')${scopedWhere}`,
      params,
    );
    return { pending_actions: numberFrom(result[0]?.pending_actions) };
  }

  private riskIndicators(values: AnalyticsRiskSummary) {
    const indicators: RiskIndicator[] = [];
    if (numberFrom(values.attendance?.late_rate) > 10) {
      indicators.push({
        code: 'ATTENDANCE_LATENESS_RISK',
        severity: 'MEDIUM',
        explanation: 'Late rate is above 10% of finalized attendance days.',
      });
    }
    if (numberFrom(values.finance?.arrears_ratio) > 0) {
      indicators.push({
        code: 'EMPLOYEE_FINANCE_ARREARS',
        severity: 'HIGH',
        explanation: 'Some employee finance balances are marked in arrears.',
      });
    }
    if (numberFrom(values.approvals?.pending_actions) > 20) {
      indicators.push({
        code: 'APPROVAL_BACKLOG',
        severity: 'MEDIUM',
        explanation:
          'Open approval/action items exceed the management threshold.',
      });
    }
    return indicators;
  }
}

@Injectable()
export class AnalyticsReportService {
  constructor(
    private readonly datasetService: AnalyticsDatasetService,
    private readonly privacyService: AnalyticsPrivacyService,
    private readonly auditService: AnalyticsAuditService,
    private readonly scopeService: AnalyticsScopeService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async runCustomReport(
    actor: AuthenticatedUser,
    dto: AnalyticsCustomReportDto,
  ) {
    this.privacyService.assertRawSqlDisabled(dto.filters);
    const scope = await this.scopeService.resolve(actor, dto);
    const dataset = await this.datasetService.requireDataset(dto.dataset_code);
    const dimensions = dto.dimensions.map((item) => item.trim());
    const measures = dto.measures.map((item) => item.trim());
    const unknownDimensions = dimensions.filter(
      (item) => !dataset.allowedDimensions.includes(item),
    );
    const unknownMeasures = measures.filter(
      (item) => !dataset.allowedMeasures.includes(item),
    );
    if (unknownDimensions.length) {
      throw new BadRequestException(
        `Unknown dimensions: ${unknownDimensions.join(', ')}`,
      );
    }
    if (unknownMeasures.length) {
      throw new BadRequestException(
        `Unknown measures: ${unknownMeasures.join(', ')}`,
      );
    }
    const range = defaultRange(dto);
    if (daysBetween(range.dateFrom, range.dateTo) > 1095) {
      throw new BadRequestException(
        'Custom report date range exceeds 1095 days.',
      );
    }
    const rows = await this.queryDataset(
      dataset.code,
      scope,
      range,
      dto.limit ?? 1000,
    );
    await this.auditService.log({
      actor,
      action: 'analytics.report.run',
      resourceType: 'REPORT',
      resourceCode: dataset.code,
      purpose: dto.purpose ?? null,
      scopeHash: scope.scopeHash,
      sensitivity: dataset.sensitivity,
      metadata: { dimensions, measures, row_count: rows.length },
    });
    return {
      dataset_code: dataset.code,
      dimensions,
      measures,
      rows,
      row_count: rows.length,
      freshness_note:
        'Only approved, finalized, locked, posted, or completed source states are included where applicable.',
    };
  }

  private queryDataset(
    datasetCode: string,
    scope: AnalyticsResolvedScope,
    range: { dateFrom: string; dateTo: string },
    limit: number,
  ): Promise<AnalyticsQueryRow[]> {
    if (datasetCode === 'ATTENDANCE_DAILY_SUMMARIES') {
      const params: unknown[] = [
        scope.companyId,
        range.dateFrom,
        range.dateTo,
        limit,
      ];
      const scopedWhere = scopeSql(scope, params, {
        employeeColumn: 'employee_id',
        branchColumn: 'branch_id',
      });
      return queryRows<AnalyticsQueryRow>(
        this.dataSource,
        `SELECT attendance_date, branch_id, status, COUNT(*)::int AS employee_days,
          SUM(work_minutes)::int AS work_minutes, SUM(late_minutes)::int AS late_minutes
         FROM analytics.fact_attendance_daily
         WHERE company_id = $1 AND attendance_date BETWEEN $2 AND $3${scopedWhere}
         GROUP BY attendance_date, branch_id, status
         ORDER BY attendance_date DESC LIMIT $4`,
        params,
      );
    }
    if (datasetCode === 'EMPLOYEE_PAYROLL_RESULTS') {
      const params: unknown[] = [scope.companyId, limit];
      const scopedWhere = scopeSql(scope, params, {
        employeeColumn: 'employee_id',
      });
      return queryRows<AnalyticsQueryRow>(
        this.dataSource,
        `SELECT payroll_period_id, COUNT(*)::int AS employee_count,
          SUM(gross_pay) AS gross_pay, SUM(net_pay) AS net_pay
         FROM analytics.fact_payroll_employee_period
         WHERE company_id = $1${scopedWhere}
         GROUP BY payroll_period_id ORDER BY payroll_period_id DESC LIMIT $2`,
        params,
      );
    }
    if (datasetCode === 'EMPLOYEE_FINANCE_ACCOUNTS') {
      const params: unknown[] = [
        scope.companyId,
        range.dateFrom,
        range.dateTo,
        limit,
      ];
      const scopedWhere = scopeSql(scope, params, {
        employeeColumn: 'employee_id',
      });
      return queryRows<AnalyticsQueryRow>(
        this.dataSource,
        `SELECT month_start, product_type, SUM(closing_balance) AS closing_balance, SUM(arrears_amount) AS arrears_amount
         FROM analytics.fact_employee_finance_monthly
         WHERE company_id = $1 AND month_start BETWEEN date_trunc('month', $2::date)::date AND date_trunc('month', $3::date)::date${scopedWhere}
         GROUP BY month_start, product_type ORDER BY month_start DESC LIMIT $4`,
        params,
      );
    }
    const params: unknown[] = [
      scope.companyId,
      range.dateFrom,
      range.dateTo,
      limit,
    ];
    const scopedWhere = scopeSql(scope, params, {
      employeeColumn: 'employee_id',
      branchColumn: 'branch_id',
      departmentColumn: 'department_id',
    });
    return queryRows<AnalyticsQueryRow>(
      this.dataSource,
      `SELECT snapshot_date, branch_id, department_id,
        COUNT(*) FILTER (WHERE is_active_headcount = true)::int AS active_headcount,
        COUNT(*) FILTER (WHERE is_new_joiner = true)::int AS joiners,
        COUNT(*) FILTER (WHERE is_exit = true)::int AS exits
       FROM analytics.fact_workforce_daily
       WHERE company_id = $1 AND snapshot_date BETWEEN $2 AND $3${scopedWhere}
       GROUP BY snapshot_date, branch_id, department_id
       ORDER BY snapshot_date DESC LIMIT $4`,
      params,
    );
  }
}

@Injectable()
export class AnalyticsExportService {
  constructor(
    private readonly reportService: AnalyticsReportService,
    private readonly configService: ConfigService,
    @InjectRepository(AnalyticsExportJob)
    private readonly repository: Repository<AnalyticsExportJob>,
  ) {}

  async create(actor: AuthenticatedUser, dto: AnalyticsExportDto) {
    const companyId = actor.companyId!;
    const idempotencyKey = dto.idempotency_key ?? hash({ companyId, dto });
    const existing = await this.repository.findOne({
      where: { companyId, idempotencyKey },
    });
    if (existing) return existing;
    const result = await this.reportService.runCustomReport(actor, dto);
    const maxRows = this.configService.get<number>(
      'ANALYTICS_MAX_EXPORT_ROWS',
      250000,
    );
    if (result.row_count > maxRows)
      throw new BadRequestException('Analytics export row limit exceeded.');
    const expiresAt = new Date(
      Date.now() +
        this.configService.get<number>('ANALYTICS_EXPORT_EXPIRY_HOURS', 24) *
          3600000,
    );
    const outputFormat = (dto.output_format ?? 'CSV').toUpperCase();
    const extension = outputFormat === 'JSON' ? 'json' : 'csv';
    const filePath = `private-uploads/analytics/${companyId}/${idempotencyKey}.${extension}`;
    const absolutePath = join(process.cwd(), filePath);
    await fs.mkdir(
      join(process.cwd(), 'private-uploads', 'analytics', String(companyId)),
      {
        recursive: true,
      },
    );
    await fs.writeFile(
      absolutePath,
      outputFormat === 'JSON'
        ? JSON.stringify(result.rows, null, 2)
        : serializeCsv(result.rows as Record<string, unknown>[]),
      'utf8',
    );
    return this.repository.save(
      this.repository.create({
        companyId,
        requestedByCompanyUserId: actor.companyMembershipId ?? null,
        reportCode: dto.dataset_code,
        outputFormat,
        status: AnalyticsExportStatusEnum.COMPLETED,
        filters: { ...dto },
        rowCount: result.row_count,
        filePath,
        expiresAt,
        idempotencyKey,
      }),
    );
  }
}

@Injectable()
export class AnalyticsReconciliationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Cron(process.env.ANALYTICS_RECONCILIATION_CRON || '0 30 3 * * *')
  scheduledReconciliation() {
    return null;
  }

  async reconcile(actor: AuthenticatedUser) {
    const companyId = actor.companyId!;
    const issues = [
      ...(await this.reconcilePayroll(companyId)),
      ...(await this.reconcileEmployeeFinance(companyId)),
    ];
    return { company_id: companyId, issue_count: issues.length, issues };
  }

  async reconcilePayroll(companyId: number) {
    const rows = await queryRows<PayrollReconciliationRow>(
      this.dataSource,
      `SELECT run.id, run.gross_total, run.net_pay_total,
        COALESCE(SUM(fact.gross_pay), 0) AS analytics_gross,
        COALESCE(SUM(fact.net_pay), 0) AS analytics_net
       FROM payroll_runs run
       LEFT JOIN analytics.fact_payroll_employee_period fact ON fact.payroll_run_id = run.id AND fact.company_id = run.company_id
       WHERE run.company_id = $1 AND run.status = 'LOCKED'
       GROUP BY run.id`,
      [companyId],
    );
    return rows.flatMap((row) => {
      const issues: AnalyticsIssue[] = [];
      if (
        PayrollMoney.toCents(row.gross_total) !==
        PayrollMoney.toCents(row.analytics_gross)
      ) {
        issues.push({
          code: 'PAYROLL_ANALYTICS_GROSS_MISMATCH',
          payroll_run_id: row.id,
          expected: row.gross_total,
          actual: row.analytics_gross,
        });
      }
      if (
        PayrollMoney.toCents(row.net_pay_total) !==
        PayrollMoney.toCents(row.analytics_net)
      ) {
        issues.push({
          code: 'PAYROLL_ANALYTICS_NET_MISMATCH',
          payroll_run_id: row.id,
          expected: row.net_pay_total,
          actual: row.analytics_net,
        });
      }
      return issues;
    });
  }

  async reconcileEmployeeFinance(companyId: number) {
    const rows = await queryRows<EmployeeFinanceReconciliationRow>(
      this.dataSource,
      `SELECT account.id, account.outstanding_total,
        COALESCE((SELECT SUM(CASE WHEN direction = 'DEBIT' THEN total_amount ELSE -total_amount END)
          FROM employee_finance_ledger_entries ledger
          WHERE ledger.company_id = account.company_id AND ledger.account_id = account.id), 0) AS ledger_balance
       FROM employee_finance_accounts account WHERE account.company_id = $1`,
      [companyId],
    );
    return rows
      .filter(
        (row) =>
          EmployeeFinanceMoney.toCents(row.outstanding_total) !==
          EmployeeFinanceMoney.toCents(row.ledger_balance),
      )
      .map((row) => ({
        code: 'LOAN_ANALYTICS_LEDGER_MISMATCH',
        account_id: row.id,
        expected: row.outstanding_total,
        actual: row.ledger_balance,
      }));
  }
}

@Injectable()
export class AnalyticsAlertService {
  explainableRiskIndicators(summary: AnalyticsRiskSummary) {
    const indicators: RiskIndicator[] = [];
    if (numberFrom(summary?.attendance?.late_rate) > 10) {
      indicators.push({
        code: 'ATTENDANCE_DISCIPLINE',
        explanation:
          'Late attendance rate is above configured management threshold.',
      });
    }
    return indicators;
  }
}

@Injectable()
export class AnalyticsChangeEventService {
  constructor(
    @InjectRepository(AnalyticsChangeEvent)
    private readonly repository: Repository<AnalyticsChangeEvent>,
  ) {}

  async record(args: {
    companyId?: number | null;
    sourceCode: string;
    sourceId: string | number;
    eventType: string;
    payload?: Record<string, unknown> | null;
  }) {
    const idempotencyKey = hash(args);
    const existing = await this.repository.findOne({
      where: { idempotencyKey },
    });
    if (existing) return existing;
    return this.repository.save(
      this.repository.create({
        companyId: args.companyId ?? null,
        sourceCode: args.sourceCode,
        sourceId: String(args.sourceId),
        eventType: args.eventType,
        idempotencyKey,
        payload: args.payload ?? null,
      }),
    );
  }
}

@Injectable()
export class AnalyticsStatutoryReportService {
  constructor(
    private readonly auditService: AnalyticsAuditService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(StatutoryReportRun)
    private readonly repository: Repository<StatutoryReportRun>,
  ) {}

  async run(actor: AuthenticatedUser, dto: StatutoryReportRunDto) {
    const range = defaultRange(dto);
    const payroll = await queryRows<StatutoryPayrollTotalsRow>(
      this.dataSource,
      `SELECT COALESCE(SUM(result.gross_pay), 0) AS gross_pay,
        COALESCE(SUM(result.employee_deductions), 0) AS deductions,
        COALESCE(SUM(result.net_pay), 0) AS net_pay
       FROM employee_payroll_results result
       JOIN payroll_runs run ON run.id = result.payroll_run_id
       JOIN payroll_periods period ON period.id = result.payroll_period_id
       WHERE result.company_id = $1 AND run.status = 'LOCKED'
         AND period.start_date >= $2 AND period.end_date <= $3`,
      [actor.companyId!, range.dateFrom, range.dateTo],
    );
    const snapshot = {
      report_code: dto.report_code,
      period: range,
      totals: payroll[0] ?? {},
      source_policy: 'LOCKED_PAYROLL_ONLY',
    };
    const outputHash = hash(snapshot);
    const run = await this.repository.save(
      this.repository.create({
        companyId: actor.companyId!,
        runNo: `STAT-${actor.companyId}-${dto.report_code}-${Date.now()}`,
        reportCode: dto.report_code.trim().toUpperCase(),
        periodFrom: range.dateFrom,
        periodTo: range.dateTo,
        sourceHash: outputHash,
        outputHash,
        snapshot,
      }),
    );
    await this.auditService.log({
      actor,
      action: 'analytics.statutory_report.generated',
      resourceType: 'STATUTORY_REPORT',
      resourceCode: dto.report_code,
      sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    });
    return run;
  }
}
