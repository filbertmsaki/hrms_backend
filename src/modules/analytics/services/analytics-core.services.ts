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
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DataSource, IsNull, Repository, type DeepPartial } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { EmployeeFinanceMoney } from '../../hr/employee-finance/services/employee-finance-money.util';
import { EmployeeFinanceLedgerService } from '../../hr/employee-finance/services/employee-finance-core.services';
import { LeaveBalanceService } from '../../hr/leave/services/leave-balance.service';
import { PayrollMoney } from '../../hr/payroll/services/payroll-money.util';
import { KpiScoringFormulaEnum } from '../../hr/performance/enums/kpi-scoring-formula.enum';
import { PerformanceScoringService } from '../../hr/performance/services/performance-scoring.service';
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
  AnalyticsSavedReport,
  AnalyticsSnapshotRun,
  AnalyticsWorkforceDailyFact,
  StatutoryReportRun,
} from '../entities/analytics.entities';
import {
  AnalyticsCustomReportDto,
  AnalyticsExportDto,
  AnalyticsOperationalReportQueryDto,
  AnalyticsQueryDto,
  AnalyticsRefreshDto,
  QuerySavedAnalyticsReportsDto,
  SaveAnalyticsReportDto,
  StatutoryReportRunDto,
  UpdateSavedAnalyticsReportDto,
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

function reportColumns(rows: Record<string, unknown>[]) {
  return Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
}

function reportCellText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}

async function serializeXlsx(rows: Record<string, unknown>[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HRMS Reports & Analytics';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Report');
  const columns = reportColumns(rows);
  worksheet.columns = columns.map((column) => ({
    header: column.replace(/_/g, ' '),
    key: column,
    width: Math.min(Math.max(column.length + 4, 14), 42),
  }));
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

function serializePdf(rows: Record<string, unknown>[], title: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ margin: 36, size: 'A4' });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    document.fontSize(15).text(title, { align: 'left' });
    document.moveDown(0.5);
    document
      .fontSize(9)
      .fillColor('#666666')
      .text(`Generated ${new Date().toISOString()}`);
    document.moveDown();
    document.fillColor('#000000');

    const columns = reportColumns(rows).slice(0, 8);
    if (!rows.length || !columns.length) {
      document.fontSize(10).text('No records matched the selected filters.');
      document.end();
      return;
    }

    document.fontSize(8).font('Helvetica-Bold');
    document.text(
      columns.map((column) => column.replace(/_/g, ' ')).join(' | '),
    );
    document.font('Helvetica').moveDown(0.3);

    rows.slice(0, 1000).forEach((row) => {
      if (document.y > 760) {
        document.addPage();
      }
      document
        .fontSize(7)
        .text(
          columns
            .map((column) =>
              reportCellText(row[column]).replace(/\s+/g, ' ').slice(0, 60),
            )
            .join(' | '),
          { lineGap: 2 },
        );
    });

    if (rows.length > 1000) {
      document.moveDown();
      document
        .fontSize(8)
        .fillColor('#666666')
        .text(
          `Output truncated to first 1000 rows in PDF. Total rows: ${rows.length}.`,
        );
    }

    document.end();
  });
}

function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9_.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function catalogReport(
  code: string,
  name: string,
  dataSource: string | null,
  requiredPermissions: string[],
) {
  const hasOperationalRunner =
    typeof OPERATIONAL_REPORTS !== 'undefined' &&
    OPERATIONAL_REPORTS.some((definition) => definition.code === code);
  return {
    code,
    name,
    data_source: dataSource,
    required_permissions: requiredPermissions,
    filters: [
      'date_from',
      'date_to',
      'branch_id',
      'department_id',
      'employee_id',
    ],
    exports: ['CSV', 'XLSX', 'PDF'],
    implementation_status: hasOperationalRunner
      ? 'DEDICATED_OPERATIONAL_RUNNER'
      : dataSource
        ? 'AVAILABLE_VIA_ANALYTICS_DATASET'
        : 'REQUIRES_MODULE_SPECIFIC_RUNNER',
  };
}

function catalogCategory(
  name: string,
  reports: ReturnType<typeof catalogReport>[],
) {
  return { name, reports };
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

  reportCatalog() {
    return {
      module: 'Reports & Analytics',
      generated_at: new Date().toISOString(),
      categories: [
        catalogCategory('Dashboard', [
          catalogReport(
            'REPORTS_DASHBOARD',
            'Reports dashboard',
            'ANALYTICS_DASHBOARD',
            ['analytics:dashboards:hr'],
          ),
        ]),
        catalogCategory('Employee Reports', [
          catalogReport(
            'EMPLOYEE_MASTER',
            'Employee Master Report',
            'EMPLOYEES',
            ['employees:read'],
          ),
          catalogReport('NEW_JOINERS', 'New Joiner Report', 'EMPLOYEES', [
            'employees:read',
          ]),
          catalogReport(
            'CONFIRMATION_DUE',
            'Confirmation Due Report',
            'PROBATION_CASES',
            ['probation_cases:read'],
          ),
          catalogReport('PROBATION', 'Probation Report', 'PROBATION_CASES', [
            'probation_cases:read',
          ]),
          catalogReport('TRANSFERS', 'Transfer Report', 'EMPLOYEE_MOVEMENTS', [
            'employee_movements:read',
          ]),
          catalogReport(
            'PROMOTIONS',
            'Promotion Report',
            'EMPLOYEE_MOVEMENTS',
            ['employee_movements:read'],
          ),
          catalogReport(
            'RESIGNATIONS',
            'Resignation Report',
            'OFFBOARDING_REQUESTS',
            ['offboarding:read'],
          ),
          catalogReport('EXITS', 'Exit Report', 'OFFBOARDING_REQUESTS', [
            'offboarding:read',
          ]),
          catalogReport(
            'EMPLOYEE_DOCUMENTS',
            'Employee Document Report',
            null,
            ['hr_documents:read'],
          ),
          catalogReport(
            'EMPLOYEE_HISTORY',
            'Employee History Report',
            'EMPLOYEE_ASSIGNMENT_HISTORY',
            ['employee_assignments:read'],
          ),
        ]),
        catalogCategory('Attendance Reports', [
          catalogReport(
            'DAILY_ATTENDANCE',
            'Daily Attendance',
            'ATTENDANCE_DAILY_SUMMARIES',
            ['attendance_summaries:read'],
          ),
          catalogReport(
            'MONTHLY_ATTENDANCE',
            'Monthly Attendance',
            'ATTENDANCE_DAILY_SUMMARIES',
            ['attendance_summaries:read'],
          ),
          catalogReport(
            'LATE_COMING',
            'Late Coming Report',
            'ATTENDANCE_DAILY_SUMMARIES',
            ['attendance_summaries:read'],
          ),
          catalogReport(
            'EARLY_GOING',
            'Early Going Report',
            'ATTENDANCE_DAILY_SUMMARIES',
            ['attendance_summaries:read'],
          ),
          catalogReport(
            'ABSENTEEISM',
            'Absenteeism Report',
            'ATTENDANCE_DAILY_SUMMARIES',
            ['attendance_summaries:read'],
          ),
          catalogReport(
            'MISSING_PUNCH',
            'Missing Punch Report',
            'ATTENDANCE_DAILY_SUMMARIES',
            ['attendance_summaries:read'],
          ),
          catalogReport(
            'ATTENDANCE_CORRECTIONS',
            'Attendance Correction Report',
            null,
            ['attendance_corrections:read'],
          ),
          catalogReport(
            'OVERTIME',
            'Overtime Report',
            'ATTENDANCE_DAILY_SUMMARIES',
            ['attendance_summaries:read'],
          ),
          catalogReport(
            'OFFICE_ATTENDANCE',
            'Office Attendance Report',
            'ATTENDANCE_DAILY_SUMMARIES',
            ['attendance_summaries:read'],
          ),
          catalogReport(
            'FIELD_ATTENDANCE_GEOLOCATION',
            'Field Attendance with Geolocation',
            'FIELD_VISITS',
            ['field_locations:read'],
          ),
        ]),
        catalogCategory('Leave Reports', [
          catalogReport(
            'LEAVE_BALANCE',
            'Leave Balance Report',
            'LEAVE_LEDGER',
            ['leave_balances:read'],
          ),
          catalogReport(
            'LEAVE_AVAILED',
            'Leave Availed Report',
            'LEAVE_REQUESTS',
            ['leave_requests:read'],
          ),
          catalogReport(
            'LEAVE_PENDING_APPROVAL',
            'Leave Pending Approval Report',
            'LEAVE_REQUESTS',
            ['leave_requests:read'],
          ),
          catalogReport(
            'LEAVE_WITHOUT_PAY',
            'Leave Without Pay Report',
            'LEAVE_REQUESTS',
            ['leave_requests:read'],
          ),
          catalogReport(
            'DEPARTMENT_LEAVE',
            'Department-wise Leave Report',
            'LEAVE_REQUESTS',
            ['leave_requests:read'],
          ),
          catalogReport(
            'EMPLOYEE_LEAVE_HISTORY',
            'Employee-wise Leave History',
            'LEAVE_REQUESTS',
            ['leave_requests:read'],
          ),
        ]),
        catalogCategory('Field Staff Reports', [
          catalogReport(
            'GEOLOCATION_ATTENDANCE',
            'Geolocation Attendance Report',
            'FIELD_VISITS',
            ['field_locations:read'],
          ),
          catalogReport(
            'VISIT_PLAN',
            'Visit Plan Report',
            'FIELD_OPPORTUNITIES',
            ['field_visits:hr:read'],
          ),
          catalogReport('ACTUAL_VISIT', 'Actual Visit Report', 'FIELD_VISITS', [
            'field_visits:hr:read',
          ]),
          catalogReport(
            'PLANNED_VS_ACTUAL_VISIT',
            'Planned vs Actual Visit Report',
            'FIELD_VISITS',
            ['field_visits:hr:read'],
          ),
          catalogReport('CLIENT_VISIT', 'Client Visit Report', 'FIELD_VISITS', [
            'field_visits:hr:read',
          ]),
          catalogReport(
            'FIELD_PRODUCTIVITY',
            'Field Productivity Report',
            'FIELD_VISITS',
            ['field_visits:hr:read'],
          ),
          catalogReport(
            'MAP_VISITS',
            'Map-Based Movement / Visit Report',
            'FIELD_VISITS',
            ['field_locations:read'],
          ),
          catalogReport(
            'ATTENDANCE_WITHOUT_ACTIVITY',
            'Attendance Without Activity Exception Report',
            'ACTION_ITEMS',
            ['work_activities:hr:read'],
          ),
          catalogReport(
            'FIELD_MONTHLY_PRODUCTIVITY',
            'Field Staff Monthly Productivity Report',
            'FIELD_VISITS',
            ['field_visits:hr:read'],
          ),
        ]),
        catalogCategory('Activity Reports', [
          catalogReport(
            'DAILY_ACTIVITY',
            'Daily Activity Report',
            'DAILY_ACTIVITY_REPORTS',
            ['work_activities:hr:read'],
          ),
          catalogReport(
            'WEEKLY_ACTIVITY',
            'Weekly Activity Report',
            'DAILY_ACTIVITY_REPORTS',
            ['work_activities:hr:read'],
          ),
          catalogReport(
            'MONTHLY_ACTIVITY',
            'Monthly Activity Report',
            'DAILY_ACTIVITY_REPORTS',
            ['work_activities:hr:read'],
          ),
          catalogReport(
            'QUARTERLY_ACTIVITY',
            'Quarterly Activity Report',
            'DAILY_ACTIVITY_REPORTS',
            ['work_activities:hr:read'],
          ),
          catalogReport(
            'PENDING_ACTIVITY',
            'Pending Activity Report',
            'ACTION_ITEMS',
            ['work_activities:manager:read'],
          ),
          catalogReport(
            'MANAGER_REVIEW',
            'Manager Review Report',
            'DAILY_ACTIVITY_REPORTS',
            ['work_activities:manager:review'],
          ),
          catalogReport(
            'ACTIVITY_VS_KPI',
            'Activity vs KPI Report',
            'DAILY_ACTIVITY_REPORTS',
            ['performance_kpis:read'],
          ),
        ]),
        catalogCategory('KPI & Performance Reports', [
          catalogReport(
            'KPI_ASSIGNMENTS',
            'Employee KPI Assignment Report',
            'PERFORMANCE_REVIEWS',
            ['performance_kpis:read'],
          ),
          catalogReport(
            'KPI_TARGET_VS_ACHIEVEMENT',
            'Monthly KPI Target vs Achievement',
            'PERFORMANCE_REVIEWS',
            ['performance_reports:read'],
          ),
          catalogReport(
            'MONTHLY_KPI_SCORE',
            'Monthly KPI Score',
            'PERFORMANCE_REVIEWS',
            ['performance_reports:read'],
          ),
          catalogReport(
            'QUARTERLY_KPI_AVERAGE',
            'Quarterly KPI Average',
            'PERFORMANCE_AGGREGATES',
            ['performance_aggregates:read'],
          ),
          catalogReport(
            'ANNUAL_KPI_AVERAGE',
            'Annual KPI Average',
            'PERFORMANCE_AGGREGATES',
            ['performance_aggregates:read'],
          ),
          catalogReport(
            'DEPARTMENT_PERFORMANCE',
            'Department-wise Performance',
            'PERFORMANCE_AGGREGATES',
            ['performance_dashboards:read'],
          ),
          catalogReport(
            'BRANCH_PERFORMANCE',
            'Branch-wise Performance',
            'PERFORMANCE_AGGREGATES',
            ['performance_dashboards:read'],
          ),
          catalogReport(
            'TOP_PERFORMERS',
            'Top Performer Report',
            'PERFORMANCE_AGGREGATES',
            ['performance_reports:read'],
          ),
          catalogReport(
            'LOW_PERFORMERS',
            'Low Performer Report',
            'PERFORMANCE_AGGREGATES',
            ['performance_reports:read'],
          ),
          catalogReport(
            'PERFORMANCE_TREND',
            'Performance Trend Report',
            'PERFORMANCE_AGGREGATES',
            ['performance_reports:read'],
          ),
          catalogReport(
            'KPI_SCORE_HISTORY',
            'KPI Score History',
            'PERFORMANCE_AGGREGATES',
            ['performance_reports:read'],
          ),
          catalogReport(
            'EMPLOYEE_PERFORMANCE_DASHBOARD',
            'Employee Performance Dashboard',
            'PERFORMANCE_REVIEWS',
            ['performance_self_service:read'],
          ),
        ]),
        catalogCategory('Payroll Reports', [
          catalogReport(
            'PAYROLL_REGISTER',
            'Payroll Register',
            'EMPLOYEE_PAYROLL_RESULTS',
            ['payroll:reports'],
          ),
          catalogReport(
            'SALARY_SHEET',
            'Salary Sheet',
            'EMPLOYEE_PAYROLL_RESULTS',
            ['payroll:reports'],
          ),
          catalogReport(
            'PAYSLIP',
            'Payslip Report',
            'EMPLOYEE_PAYROLL_RESULTS',
            ['payroll:payslips:read'],
          ),
          catalogReport('BANK_TRANSFER', 'Bank Transfer Report', null, [
            'payroll:banking',
          ]),
          catalogReport(
            'PAYROLL_VARIANCE',
            'Payroll Variance Report',
            'EMPLOYEE_PAYROLL_RESULTS',
            ['payroll:reports'],
          ),
          catalogReport(
            'SALARY_COST_DEPARTMENT',
            'Salary Cost by Department',
            'EMPLOYEE_PAYROLL_RESULTS',
            ['payroll:reports'],
          ),
          catalogReport(
            'SALARY_COST_BRANCH',
            'Salary Cost by Branch',
            'EMPLOYEE_PAYROLL_RESULTS',
            ['payroll:reports'],
          ),
          catalogReport(
            'LOAN_DEDUCTION',
            'Loan Deduction Report',
            'EMPLOYEE_PAYROLL_LINE_ITEMS',
            ['payroll:reports'],
          ),
          catalogReport(
            'LWP_DEDUCTION',
            'Leave Without Pay Deduction Report',
            'EMPLOYEE_PAYROLL_LINE_ITEMS',
            ['payroll:reports'],
          ),
          catalogReport(
            'STATUTORY_DEDUCTION',
            'Statutory Deduction Report',
            'EMPLOYEE_PAYROLL_LINE_ITEMS',
            ['analytics:statutory-reports'],
          ),
          catalogReport(
            'FINAL_SETTLEMENT',
            'Full and Final Settlement Report',
            'EMPLOYEE_PAYROLL_RESULTS',
            ['payroll:final-settlements'],
          ),
        ]),
        catalogCategory('Staff Loan Reports', [
          catalogReport(
            'LOAN_APPLICATION',
            'Loan Application Report',
            'EMPLOYEE_FINANCE_ACCOUNTS',
            ['employee_finance:applications:read'],
          ),
          catalogReport(
            'LOAN_APPROVAL',
            'Loan Approval Report',
            'EMPLOYEE_FINANCE_ACCOUNTS',
            ['employee_finance:applications:read'],
          ),
          catalogReport(
            'ACTIVE_LOAN',
            'Active Loan Report',
            'EMPLOYEE_FINANCE_ACCOUNTS',
            ['employee_finance:accounts:read'],
          ),
          catalogReport(
            'MONTHLY_LOAN_DEDUCTION',
            'Monthly Deduction Report',
            'EMPLOYEE_FINANCE_INSTALLMENTS',
            ['employee_finance:reports'],
          ),
          catalogReport(
            'LOAN_OUTSTANDING',
            'Loan Outstanding Report',
            'EMPLOYEE_FINANCE_ACCOUNTS',
            ['employee_finance:reports'],
          ),
          catalogReport(
            'LOAN_SETTLEMENT',
            'Loan Settlement Report',
            'EMPLOYEE_FINANCE_LEDGER_ENTRIES',
            ['employee_finance:settlements'],
          ),
        ]),
        catalogCategory('Custom Reports', [
          catalogReport(
            'CUSTOM_REPORT_BUILDER',
            'Custom Report Builder',
            'ANY_ANALYTICS_DATASET',
            ['analytics:reports'],
          ),
          catalogReport(
            'SAVED_REPORTS',
            'Saved Reports',
            'ANALYTICS_SAVED_REPORTS',
            ['analytics:reports'],
          ),
        ]),
      ],
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
    const extension =
      outputFormat === 'JSON'
        ? 'json'
        : outputFormat === 'XLSX'
          ? 'xlsx'
          : outputFormat === 'PDF'
            ? 'pdf'
            : 'csv';
    const filePath = `private-uploads/analytics/${companyId}/${idempotencyKey}.${extension}`;
    const absolutePath = join(process.cwd(), filePath);
    await fs.mkdir(
      join(process.cwd(), 'private-uploads', 'analytics', String(companyId)),
      {
        recursive: true,
      },
    );
    const rows = result.rows as Record<string, unknown>[];
    const fileBuffer =
      outputFormat === 'JSON'
        ? Buffer.from(JSON.stringify(rows, null, 2), 'utf8')
        : outputFormat === 'XLSX'
          ? await serializeXlsx(rows)
          : outputFormat === 'PDF'
            ? await serializePdf(rows, dto.dataset_code)
            : Buffer.from(serializeCsv(rows), 'utf8');
    await fs.writeFile(absolutePath, fileBuffer);
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

  async download(actor: AuthenticatedUser, id: string) {
    const companyId = actor.companyId!;
    const exportJob = await this.repository.findOne({
      where: { id, companyId },
    });
    if (!exportJob?.filePath) {
      throw new NotFoundException('Analytics export was not found');
    }
    const absolutePath = join(process.cwd(), exportJob.filePath);
    const buffer = await fs.readFile(absolutePath);
    const extension =
      exportJob.outputFormat === 'XLSX'
        ? 'xlsx'
        : exportJob.outputFormat === 'PDF'
          ? 'pdf'
          : exportJob.outputFormat === 'JSON'
            ? 'json'
            : 'csv';
    const base = sanitizeFilenamePart(
      exportJob.reportCode || 'analytics-report',
    );
    return {
      filename: `${base}-${exportJob.id}.${extension}`,
      mimeType:
        exportJob.outputFormat === 'XLSX'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : exportJob.outputFormat === 'PDF'
            ? 'application/pdf'
            : exportJob.outputFormat === 'JSON'
              ? 'application/json'
              : 'text/csv',
      buffer,
    };
  }
}

@Injectable()
export class AnalyticsSavedReportService {
  constructor(
    private readonly reportService: AnalyticsReportService,
    private readonly auditService: AnalyticsAuditService,
    private readonly datasetService: AnalyticsDatasetService,
    private readonly scopeService: AnalyticsScopeService,
    @InjectRepository(AnalyticsSavedReport)
    private readonly repository: Repository<AnalyticsSavedReport>,
  ) {}

  async list(actor: AuthenticatedUser, query: QuerySavedAnalyticsReportsDto) {
    const companyId = actor.companyId!;
    const scope = await this.scopeService.resolve(actor, {});
    const canManageSavedReports = hasPermission(
      actor.permissions,
      'reports.custom.manage',
    );
    const qb = this.repository
      .createQueryBuilder('report')
      .where('report.company_id = :companyId', { companyId })
      .andWhere('report.status = :status', { status: 'ACTIVE' })
      .andWhere(
        `(
          report.owner_company_user_id = :ownerId
          OR report.visibility = :shared
          OR (:canManageSavedReports = true AND report.visibility = :adminOnly)
          OR (
            report.visibility = :department
            AND report.department_scope_id IS NOT NULL
            AND report.department_scope_id = :departmentScopeId
          )
        )`,
        {
          ownerId: actor.companyMembershipId,
          shared: 'SHARED',
          department: 'DEPARTMENT',
          adminOnly: 'ADMIN_ONLY',
          departmentScopeId: scope.departmentId,
          canManageSavedReports,
        },
      )
      .orderBy('report.created_at', 'DESC');

    if (query.dataset_code?.trim()) {
      qb.andWhere('report.dataset_code = :datasetCode', {
        datasetCode: query.dataset_code.trim().toUpperCase(),
      });
    }

    if (query.visibility?.trim()) {
      qb.andWhere('report.visibility = :visibility', {
        visibility: query.visibility.trim().toUpperCase(),
      });
    }

    if (query.department_scope_id) {
      qb.andWhere('report.department_scope_id = :departmentScopeIdFilter', {
        departmentScopeIdFilter: query.department_scope_id,
      });
    }

    const rows = await qb.getMany();
    await this.auditService.log({
      actor,
      action: 'analytics.saved_report.list',
      resourceType: 'SAVED_REPORT',
      resourceCode: query.dataset_code ?? 'ALL',
      metadata: { row_count: rows.length },
    });
    return rows;
  }

  async create(actor: AuthenticatedUser, dto: SaveAnalyticsReportDto) {
    await this.validateReportShape(
      dto.dataset_code,
      dto.dimensions,
      dto.measures,
    );
    const visibility = (dto.visibility ?? 'PRIVATE').toUpperCase();
    const entity = this.repository.create({
      companyId: actor.companyId!,
      ownerCompanyUserId: actor.companyMembershipId!,
      ownerEmployeeId: actor.employeeId ?? null,
      departmentScopeId: await this.resolveSavedReportDepartmentScope(
        actor,
        visibility,
        dto.department_scope_id,
      ),
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      datasetCode: dto.dataset_code.trim().toUpperCase(),
      selectedDimensions: dto.dimensions.map((item) => item.trim()),
      selectedMeasures: dto.measures.map((item) => item.trim()),
      filters: dto.filters ?? null,
      sorting: dto.sorting ?? null,
      grouping: dto.grouping ?? null,
      visibility,
    });
    const saved = await this.repository.save(entity);
    await this.auditService.log({
      actor,
      action: 'analytics.saved_report.create',
      resourceType: 'SAVED_REPORT',
      resourceCode: saved.datasetCode,
      metadata: { saved_report_id: saved.id, visibility: saved.visibility },
    });
    return saved;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateSavedAnalyticsReportDto,
  ) {
    const saved = await this.requireOwned(actor, id);
    const datasetCode =
      dto.dataset_code?.trim().toUpperCase() ?? saved.datasetCode;
    const dimensions = dto.dimensions ?? saved.selectedDimensions;
    const measures = dto.measures ?? saved.selectedMeasures;
    await this.validateReportShape(datasetCode, dimensions, measures);

    if (dto.name !== undefined) saved.name = dto.name.trim();
    if (dto.description !== undefined) {
      saved.description = dto.description?.trim() || null;
    }
    saved.datasetCode = datasetCode;
    saved.selectedDimensions = dimensions.map((item) => item.trim());
    saved.selectedMeasures = measures.map((item) => item.trim());
    if (dto.filters !== undefined) saved.filters = dto.filters;
    if (dto.sorting !== undefined) saved.sorting = dto.sorting;
    if (dto.grouping !== undefined) saved.grouping = dto.grouping;
    if (dto.visibility !== undefined) {
      saved.visibility = dto.visibility.trim().toUpperCase();
    }
    if (dto.visibility !== undefined || dto.department_scope_id !== undefined) {
      saved.departmentScopeId = await this.resolveSavedReportDepartmentScope(
        actor,
        saved.visibility,
        dto.department_scope_id,
      );
    }
    const updated = await this.repository.save(saved);
    await this.auditService.log({
      actor,
      action: 'analytics.saved_report.update',
      resourceType: 'SAVED_REPORT',
      resourceCode: updated.datasetCode,
      metadata: { saved_report_id: updated.id, visibility: updated.visibility },
    });
    return updated;
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const saved = await this.requireOwned(actor, id);
    saved.status = 'ARCHIVED';
    const updated = await this.repository.save(saved);
    await this.auditService.log({
      actor,
      action: 'analytics.saved_report.archive',
      resourceType: 'SAVED_REPORT',
      resourceCode: updated.datasetCode,
      metadata: { saved_report_id: updated.id },
    });
    return updated;
  }

  async run(actor: AuthenticatedUser, id: string, query: AnalyticsQueryDto) {
    const saved = await this.requireAccessible(actor, id);
    return this.reportService.runCustomReport(actor, {
      dataset_code: saved.datasetCode,
      dimensions: saved.selectedDimensions,
      measures: saved.selectedMeasures,
      filters: saved.filters ?? undefined,
      date_from: query.date_from,
      date_to: query.date_to,
      branch_id: query.branch_id,
      department_id: query.department_id,
      employee_id: query.employee_id,
      purpose: query.purpose ?? `Saved report: ${saved.name}`,
    });
  }

  private async validateReportShape(
    datasetCode: string,
    dimensions: string[],
    measures: string[],
  ) {
    const dataset = await this.datasetService.requireDataset(datasetCode);
    const unknownDimensions = dimensions.filter(
      (item) => !dataset.allowedDimensions.includes(item.trim()),
    );
    const unknownMeasures = measures.filter(
      (item) => !dataset.allowedMeasures.includes(item.trim()),
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
  }

  private async requireOwned(actor: AuthenticatedUser, id: string) {
    const saved = await this.repository.findOne({
      where: { id, companyId: actor.companyId!, status: 'ACTIVE' },
    });
    if (!saved) {
      throw new NotFoundException('Saved report was not found');
    }
    if (saved.ownerCompanyUserId !== actor.companyMembershipId) {
      throw new BadRequestException(
        'Only the owner can change this saved report.',
      );
    }
    return saved;
  }

  private async requireAccessible(actor: AuthenticatedUser, id: string) {
    const saved = await this.repository.findOne({
      where: { id, companyId: actor.companyId!, status: 'ACTIVE' },
    });
    if (!saved) {
      throw new NotFoundException('Saved report was not found');
    }
    if (!(await this.canAccessSavedReport(actor, saved))) {
      throw new NotFoundException('Saved report was not found');
    }
    return saved;
  }

  private async resolveSavedReportDepartmentScope(
    actor: AuthenticatedUser,
    visibility: string,
    requestedDepartmentId?: number | null,
  ) {
    if (visibility !== 'DEPARTMENT') {
      return null;
    }
    if (requestedDepartmentId) {
      return requestedDepartmentId;
    }
    const scope = await this.scopeService.resolve(actor, {});
    return scope.departmentId;
  }

  private async canAccessSavedReport(
    actor: AuthenticatedUser,
    saved: AnalyticsSavedReport,
  ) {
    if (saved.ownerCompanyUserId === actor.companyMembershipId) return true;
    if (saved.visibility === 'SHARED') return true;
    if (
      saved.visibility === 'ADMIN_ONLY' &&
      hasPermission(actor.permissions, 'reports.custom.manage')
    ) {
      return true;
    }
    if (saved.visibility === 'DEPARTMENT' && saved.departmentScopeId) {
      const scope = await this.scopeService.resolve(actor, {});
      return scope.departmentId === saved.departmentScopeId;
    }
    return false;
  }
}

export type OperationalReportDefinition = {
  code: string;
  name: string;
  category: string;
  permissions: string[];
  sensitivity: AnalyticsSensitivityEnum;
  build: (args: OperationalReportQueryArgs) => {
    sql: string;
    params: unknown[];
  };
};

type OperationalReportQueryArgs = {
  companyId: number;
  scope: AnalyticsResolvedScope;
  query: AnalyticsOperationalReportQueryDto;
};

function compactSql(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function fullNameSql(alias: string) {
  return `concat_ws(' ', ${alias}.first_name, ${alias}.middle_name, ${alias}.last_name)`;
}

function maskAccountSql(expression: string) {
  return `CASE
    WHEN ${expression} IS NULL OR length(${expression}) <= 4 THEN ${expression}
    ELSE concat(repeat('*', greatest(length(${expression}) - 4, 0)), right(${expression}, 4))
  END`;
}

function addParam(params: unknown[], value: unknown) {
  params.push(value);
  return `$${params.length}`;
}

function appendScopedEmployeeFilters(
  conditions: string[],
  params: unknown[],
  scope: AnalyticsResolvedScope,
  options: {
    employeeColumn: string;
    branchColumn?: string;
    departmentColumn?: string;
  },
) {
  if (scope.employeeIds !== null) {
    conditions.push(
      `${options.employeeColumn} = ANY(${addParam(params, scope.employeeIds)}::int[])`,
    );
  }
  if (scope.employeeId) {
    conditions.push(
      `${options.employeeColumn} = ${addParam(params, scope.employeeId)}`,
    );
  }
  if (scope.branchId) {
    conditions.push(
      `${options.branchColumn ?? 'e.primary_branch_id'} = ${addParam(params, scope.branchId)}`,
    );
  }
  if (scope.departmentId) {
    conditions.push(
      `${options.departmentColumn ?? 'e.primary_department_id'} = ${addParam(params, scope.departmentId)}`,
    );
  }
}

function appendDateRange(
  conditions: string[],
  params: unknown[],
  column: string,
  query: AnalyticsOperationalReportQueryDto,
) {
  const range = defaultRange(query);
  conditions.push(
    `${column} BETWEEN ${addParam(params, range.dateFrom)} AND ${addParam(params, range.dateTo)}`,
  );
}

function appendOptionalStringFilter(
  conditions: string[],
  params: unknown[],
  column: string,
  value?: string,
) {
  if (value?.trim()) {
    conditions.push(`${column} = ${addParam(params, value.trim())}`);
  }
}

function employeeJoinSelect(prefix = 'employee') {
  return `
    e.employee_no AS ${prefix}_number,
    ${fullNameSql('e')} AS ${prefix}_name,
    department.name AS department,
    branch.name AS branch,
    position.name AS position,
    grade.name AS grade,
    manager.employee_no AS manager_number,
    ${fullNameSql('manager')} AS manager_name
  `;
}

function employeeJoins() {
  return `
    LEFT JOIN branches branch ON branch.id = e.primary_branch_id
    LEFT JOIN departments department ON department.id = e.primary_department_id
    LEFT JOIN positions position ON position.id = e.primary_position_id
    LEFT JOIN employee_grades grade ON grade.id = e.grade_id
    LEFT JOIN employees manager ON manager.id = e.reports_to
  `;
}

function buildBaseEmployeeReport(
  args: OperationalReportQueryArgs,
  dateColumn: string | null,
  extraCondition?: string,
) {
  const params: unknown[] = [args.companyId];
  const conditions = ['e.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'e.id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  if (dateColumn) appendDateRange(conditions, params, dateColumn, args.query);
  appendOptionalStringFilter(
    conditions,
    params,
    'e.employment_status',
    args.query.employment_status,
  );
  if (extraCondition) conditions.push(extraCondition);
  return { params, conditions };
}

function buildEmployeeMaster(args: OperationalReportQueryArgs) {
  const { params, conditions } = buildBaseEmployeeReport(args, null);
  return {
    params,
    sql: compactSql(`
      SELECT ${employeeJoinSelect()},
        e.employment_type,
        e.hire_date AS joining_date,
        e.employment_status,
        e.confirmation_due_date,
        e.confirmation_status
      FROM employees e
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.employee_no ASC
    `),
  };
}

function buildNewJoiners(args: OperationalReportQueryArgs) {
  const { params, conditions } = buildBaseEmployeeReport(args, 'e.hire_date');
  return {
    params,
    sql: compactSql(`
      SELECT ${employeeJoinSelect()}, e.hire_date AS joining_date,
        e.employment_type, e.employment_status AS onboarding_status
      FROM employees e
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.hire_date DESC, e.employee_no ASC
    `),
  };
}

function buildConfirmationDue(args: OperationalReportQueryArgs) {
  const { params, conditions } = buildBaseEmployeeReport(
    args,
    'COALESCE(e.confirmation_due_date, e.probation_end_date)',
    'COALESCE(e.confirmation_due_date, e.probation_end_date) IS NOT NULL',
  );
  return {
    params,
    sql: compactSql(`
      SELECT ${employeeJoinSelect()}, e.hire_date AS joining_date,
        e.probation_start_date,
        e.probation_end_date,
        COALESCE(e.confirmation_due_date, e.probation_end_date) AS confirmation_due_date,
        e.confirmation_status AS status,
        (COALESCE(e.confirmation_due_date, e.probation_end_date)::date - CURRENT_DATE)::int AS days_remaining_or_overdue
      FROM employees e
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY confirmation_due_date ASC
    `),
  };
}

function buildProbation(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['pc.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'pc.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'pc.current_due_date', args.query);
  appendOptionalStringFilter(
    conditions,
    params,
    'pc.status',
    args.query.status,
  );
  return {
    params,
    sql: compactSql(`
      SELECT pc.case_no, ${employeeJoinSelect()}, pc.current_start_date AS probation_start_date,
        pc.current_due_date AS probation_end_date, pc.status AS review_status,
        pc.final_decision AS recommendation, e.confirmation_status AS confirmation_status
      FROM probation_cases pc
      JOIN employees e ON e.id = pc.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY pc.current_due_date ASC
    `),
  };
}

function movementReport(types: string[]) {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId, types];
    const conditions = [
      'movement.company_id = $1',
      'movement.movement_type = ANY($2::text[])',
    ];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'movement.employee_id',
      branchColumn: 'e.primary_branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    appendDateRange(conditions, params, 'movement.effective_date', args.query);
    appendOptionalStringFilter(
      conditions,
      params,
      'movement.status',
      args.query.status,
    );
    return {
      params,
      sql: compactSql(`
        SELECT movement.movement_no, movement.movement_type, ${employeeJoinSelect()},
          movement.current_snapshot ->> 'departmentName' AS previous_department,
          movement.proposed_snapshot ->> 'departmentName' AS new_department,
          movement.current_snapshot ->> 'branchName' AS previous_branch,
          movement.proposed_snapshot ->> 'branchName' AS new_branch,
          movement.current_snapshot ->> 'positionName' AS previous_position,
          movement.proposed_snapshot ->> 'positionName' AS new_position,
          movement.current_snapshot ->> 'gradeName' AS previous_grade,
          movement.proposed_snapshot ->> 'gradeName' AS new_grade,
          movement.effective_date, movement.status,
          movement.approved_by_company_user_id AS approved_by,
          movement.approved_at
        FROM employee_movements movement
        JOIN employees e ON e.id = movement.employee_id
        ${employeeJoins()}
        WHERE ${conditions.join(' AND ')}
        ORDER BY movement.effective_date DESC, movement.id DESC
      `),
    };
  };
}

function offboardingReport(onlyResignation: boolean) {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId];
    const conditions = [
      'request.company_id = $1',
      'request.deleted_at IS NULL',
    ];
    if (onlyResignation)
      conditions.push(`request.offboarding_type = 'resignation'`);
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'request.employee_id',
      branchColumn: 'request.branch_id',
      departmentColumn: 'request.department_id',
    });
    appendDateRange(
      conditions,
      params,
      'request.last_working_date',
      args.query,
    );
    appendOptionalStringFilter(
      conditions,
      params,
      'request.status',
      args.query.status,
    );
    return {
      params,
      sql: compactSql(`
        SELECT request.offboarding_code, request.offboarding_type AS exit_type,
          ${employeeJoinSelect()}, request.submitted_at AS submission_date,
          request.last_working_date, request.status AS approval_status,
          request.progress_percentage AS clearance_progress,
          request.completed_at,
          COALESCE(exit_interview.status::text, 'NOT_STARTED') AS exit_interview_status,
          COALESCE(settlement.status, 'NOT_STARTED') AS final_settlement_status
        FROM offboarding_requests request
        JOIN employees e ON e.id = request.employee_id
        ${employeeJoins()}
        LEFT JOIN offboarding_exit_interviews exit_interview
          ON exit_interview.offboarding_request_id = request.id
        LEFT JOIN payroll_final_settlements settlement
          ON settlement.offboarding_request_id = request.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY request.last_working_date DESC, request.id DESC
      `),
    };
  };
}

function buildEmployeeDocuments(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['doc.company_id = $1', "doc.entity_type = 'EMPLOYEE'"];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'doc.entity_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'doc.created_at::date', args.query);
  return {
    params,
    sql: compactSql(`
      SELECT ${employeeJoinSelect()}, doc.document_type, doc.title,
        CASE WHEN doc.id IS NULL THEN false ELSE true END AS submitted,
        doc.is_verified AS verified, doc.expiry_date,
        CASE
          WHEN doc.expiry_date IS NULL THEN 'NO_EXPIRY'
          WHEN doc.expiry_date < now() THEN 'EXPIRED'
          WHEN doc.expiry_date <= now() + interval '30 days' THEN 'EXPIRING'
          ELSE 'VALID'
        END AS expiry_status
      FROM documents doc
      JOIN employees e ON e.id = doc.entity_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY doc.expiry_date ASC NULLS LAST, e.employee_no ASC
    `),
  };
}

function buildLeaveBalances(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['balance.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'balance.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  if (args.query.year) {
    conditions.push(
      `balance.fiscal_year = ${addParam(params, String(args.query.year))}`,
    );
  }
  return {
    params,
    sql: compactSql(`
      SELECT balance.id AS balance_id, ${employeeJoinSelect()}, leave_type.name AS leave_type,
        balance.opening_balance_days AS opening_balance,
        COALESCE(NULLIF(balance.accrued_days, '0'), balance.entitlement_days, balance.allocated_days) AS accrued,
        balance.used_days AS used,
        balance.pending_days AS pending,
        (
          COALESCE(NULLIF(balance.opening_balance_days, '0'), balance.carried_forward_days, '0')::numeric
          + COALESCE(NULLIF(balance.accrued_days, '0'), balance.entitlement_days, balance.allocated_days, '0')::numeric
          + balance.adjusted_days::numeric
          - balance.used_days::numeric
          - balance.pending_days::numeric
          - balance.approved_future_days::numeric
          - balance.expired_days::numeric
          - balance.attendance_deduction_days::numeric
        )::numeric(12,2) AS remaining_balance,
        balance.opening_balance_days, balance.carried_forward_days, balance.accrued_days,
        balance.entitlement_days, balance.allocated_days, balance.adjusted_days,
        balance.approved_future_days, balance.expired_days, balance.attendance_deduction_days,
        balance.fiscal_year
      FROM leave_balances balance
      JOIN employees e ON e.id = balance.employee_id
      ${employeeJoins()}
      JOIN leave_types leave_type ON leave_type.id = balance.leave_type_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.employee_no ASC, leave_type.name ASC
    `),
  };
}

function buildLeavePending(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = [
    'request.company_id = $1',
    "request.status IN ('submitted','in_review','pending_department_manager','pending_hr','returned_for_correction')",
  ];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'request.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'request.created_at::date', args.query);
  return {
    params,
    sql: compactSql(`
      SELECT ${employeeJoinSelect()}, leave_type.name AS leave_type,
        request.total_days AS requested_days, request.created_at AS request_date,
        request.current_approval_level, request.status AS approval_status,
        EXTRACT(day FROM (now() - request.created_at))::int AS days_pending
      FROM leave_requests request
      JOIN employees e ON e.id = request.employee_id
      ${employeeJoins()}
      JOIN leave_types leave_type ON leave_type.id = request.leave_type_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY request.created_at ASC
    `),
  };
}

function buildPayrollRegister(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = [
    'result.company_id = $1',
    "run.status IN ('LOCKED','PAID','CLOSED')",
  ];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'result.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  if (args.query.payroll_period_id) {
    conditions.push(
      `result.payroll_period_id = ${addParam(params, args.query.payroll_period_id)}`,
    );
  }
  if (args.query.payroll_run_id) {
    conditions.push(
      `result.payroll_run_id = ${addParam(params, args.query.payroll_run_id)}`,
    );
  }
  return {
    params,
    sql: compactSql(`
      SELECT run.run_no, result.payroll_period_id, ${employeeJoinSelect()},
        (result.compensation_snapshot ->> 'basicSalary') AS basic_salary,
        result.gross_pay AS gross_pay,
        result.employee_deductions AS deductions,
        result.net_pay AS net_pay,
        result.employer_cost AS employer_cost,
        result.status
      FROM employee_payroll_results result
      JOIN payroll_runs run ON run.id = result.payroll_run_id
      JOIN employees e ON e.id = result.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY result.payroll_period_id DESC, e.employee_no ASC
    `),
  };
}

function buildBankTransfer(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = [
    'result.company_id = $1',
    "run.status IN ('LOCKED','PAID','CLOSED')",
  ];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'result.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  if (args.query.payroll_period_id) {
    conditions.push(
      `result.payroll_period_id = ${addParam(params, args.query.payroll_period_id)}`,
    );
  }
  const accountExpr = "result.bank_account_snapshot ->> 'accountNumber'";
  return {
    params,
    sql: compactSql(`
      SELECT run.run_no, result.payroll_period_id, ${employeeJoinSelect()},
        COALESCE(result.bank_account_snapshot ->> 'bankName', result.bank_account_snapshot ->> 'bank_name') AS bank,
        ${maskAccountSql(accountExpr)} AS account_number,
        result.net_pay AS payment_amount,
        result.status
      FROM employee_payroll_results result
      JOIN payroll_runs run ON run.id = result.payroll_run_id
      JOIN employees e ON e.id = result.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY result.payroll_period_id DESC, e.employee_no ASC
    `),
  };
}

function buildLoanOutstanding(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = [
    'account.company_id = $1',
    "account.product_type = 'STAFF_LOAN'",
  ];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'account.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendOptionalStringFilter(
    conditions,
    params,
    'account.status',
    args.query.status,
  );
  return {
    params,
    sql: compactSql(`
      SELECT account.id AS account_id, account.account_no AS loan_reference, ${employeeJoinSelect()},
        account.principal_amount AS original_loan_amount,
        (account.total_payable::numeric - account.outstanding_total::numeric)::numeric(18,2) AS amount_paid,
        account.outstanding_total AS outstanding_amount,
        account.outstanding_principal, account.outstanding_interest, account.outstanding_fees,
        COUNT(installment.id) FILTER (WHERE installment.status NOT IN ('PAID','CANCELLED'))::int AS remaining_installments,
        account.status, account.maturity_date
      FROM employee_finance_accounts account
      JOIN employees e ON e.id = account.employee_id
      ${employeeJoins()}
      LEFT JOIN employee_finance_installments installment ON installment.account_id = account.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY account.id, e.id, branch.name, department.name, position.name, grade.name, manager.employee_no, manager.first_name, manager.middle_name, manager.last_name
      ORDER BY account.maturity_date ASC, e.employee_no ASC
    `),
  };
}

function buildFieldVisitMap(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['event.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'event.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'event.captured_at::date', args.query);
  return {
    params,
    sql: compactSql(`
      SELECT visit.visit_no, visit.visit_date, visit.status AS visit_status,
        event.event_type, event.captured_at, event.latitude, event.longitude,
        event.address AS location, event.location_validation_status,
        ${employeeJoinSelect()}
      FROM field_visit_location_events event
      JOIN field_visits visit ON visit.id = event.field_visit_id
      JOIN employees e ON e.id = event.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY event.captured_at DESC
    `),
  };
}

function appendPerformancePeriodFilters(
  conditions: string[],
  params: unknown[],
  query: AnalyticsOperationalReportQueryDto,
  periodAlias = 'period',
) {
  appendDateRange(conditions, params, `${periodAlias}.end_date`, query);
  if (query.year) {
    conditions.push(
      `${periodAlias}.financial_year_id = ${addParam(params, query.year)}`,
    );
  }
  if (query.quarter) {
    conditions.push(`${periodAlias}.period_type = 'QUARTERLY'`);
    conditions.push(
      `${periodAlias}.sequence_number = ${addParam(params, query.quarter)}`,
    );
  }
  if (query.month?.trim()) {
    conditions.push(`${periodAlias}.period_type = 'MONTHLY'`);
    conditions.push(
      `${periodAlias}.name ILIKE ${addParam(params, `%${query.month.trim()}%`)}`,
    );
  }
}

function buildKpiAssignments(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['plan.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'plan.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'plan.effective_from', args.query);
  appendOptionalStringFilter(
    conditions,
    params,
    'plan.status',
    args.query.status,
  );
  return {
    params,
    sql: compactSql(`
      SELECT plan.id AS performance_plan_id, item.id AS plan_item_id,
        ${employeeJoinSelect()}, plan.status AS assignment_status,
        plan.effective_from, plan.effective_to,
        definition.code AS kpi_code, definition.name AS kpi_name,
        definition.category AS kpi_category,
        version.frequency, version.scoring_formula,
        item.target_value, item.weight, item.manual_entry_allowed,
        item.evidence_required, item.notes
      FROM employee_performance_plans plan
      JOIN employee_performance_plan_items item ON item.plan_id = plan.id
      JOIN employees e ON e.id = plan.employee_id
      ${employeeJoins()}
      JOIN kpi_definition_versions version ON version.id = item.kpi_definition_version_id
      JOIN kpi_definitions definition ON definition.id = version.kpi_definition_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY plan.effective_from DESC, e.employee_no ASC, definition.name ASC
    `),
  };
}

function buildKpiTargetAchievement(
  args: OperationalReportQueryArgs,
  monthlyOnly = false,
) {
  const params: unknown[] = [args.companyId];
  const conditions = ['achievement.company_id = $1'];
  if (monthlyOnly) conditions.push(`period.period_type = 'MONTHLY'`);
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'achievement.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendPerformancePeriodFilters(conditions, params, args.query);
  appendOptionalStringFilter(
    conditions,
    params,
    'achievement.status',
    args.query.status,
  );
  return {
    params,
    sql: compactSql(`
      SELECT achievement.id AS achievement_id,
        ${employeeJoinSelect()}, period.name AS period_name,
        period.period_type, period.sequence_number, period.start_date, period.end_date,
        definition.code AS kpi_code, definition.name AS kpi_name,
        definition.category AS kpi_category, version.scoring_formula,
        version.formula_configuration, item.weight,
        achievement.target_value, achievement.achievement_value,
        achievement.raw_score, achievement.capped_score, achievement.weighted_score,
        achievement.status, achievement.submitted_at, achievement.manager_validated_at,
        achievement.hr_approved_at, achievement.published_at
      FROM kpi_achievements achievement
      JOIN performance_period_assignments assignment ON assignment.id = achievement.period_assignment_id
      JOIN performance_periods period ON period.id = assignment.performance_period_id
      JOIN employee_performance_plan_items item ON item.id = achievement.plan_item_id
      JOIN kpi_definition_versions version ON version.id = item.kpi_definition_version_id
      JOIN kpi_definitions definition ON definition.id = version.kpi_definition_id
      JOIN employees e ON e.id = achievement.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY period.end_date DESC, e.employee_no ASC, definition.name ASC
    `),
  };
}

function buildPerformanceAggregate(
  args: OperationalReportQueryArgs,
  periodType: 'QUARTERLY' | 'ANNUAL',
) {
  const params: unknown[] = [args.companyId];
  const conditions = [
    'aggregate.company_id = $1',
    `aggregate.period_type = '${periodType}'`,
  ];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'aggregate.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  if (args.query.year) {
    conditions.push(
      `aggregate.financial_year_id = ${addParam(params, args.query.year)}`,
    );
  }
  if (args.query.quarter && periodType === 'QUARTERLY') {
    conditions.push(
      `aggregate.sequence_number = ${addParam(params, args.query.quarter)}`,
    );
  }
  return {
    params,
    sql: compactSql(`
      SELECT aggregate.id AS aggregate_id, ${employeeJoinSelect()},
        aggregate.name AS period_name, aggregate.period_type, aggregate.sequence_number,
        aggregate.aggregation_method, aggregate.aggregate_score AS score,
        aggregate.rating_code, aggregate.published_at, aggregate.locked_at
      FROM performance_aggregates aggregate
      JOIN employees e ON e.id = aggregate.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY aggregate.sequence_number DESC, e.employee_no ASC
    `),
  };
}

function buildKpiScoreHistory(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['review.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'review.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendPerformancePeriodFilters(conditions, params, args.query);
  appendOptionalStringFilter(
    conditions,
    params,
    'review.status',
    args.query.status,
  );
  return {
    params,
    sql: compactSql(`
      SELECT review.id AS review_id, ${employeeJoinSelect()},
        period.name AS period_name, period.period_type, period.sequence_number,
        review.kpi_score, review.competency_score, review.adjustment_score,
        review.final_score, review.rating_code, review.status,
        review.published_at, review.locked_at, review.revision_number
      FROM performance_reviews review
      JOIN performance_periods period ON period.id = review.performance_period_id
      JOIN employees e ON e.id = review.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY period.end_date DESC, review.revision_number DESC, e.employee_no ASC
    `),
  };
}

function buildAttendanceExceptions(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['exception.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'exception.employee_id',
    branchColumn: 'exception.branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'exception.attendance_date', args.query);
  appendOptionalStringFilter(
    conditions,
    params,
    'exception.status',
    args.query.status,
  );
  return {
    params,
    sql: compactSql(`
      SELECT exception.id AS exception_id, exception.attendance_date,
        ${employeeJoinSelect()}, exception.exception_type, exception.status,
        exception.message, exception.is_system_generated,
        exception.resolved_at, exception.resolution_note, exception.created_at
      FROM attendance_processing_exceptions exception
      LEFT JOIN employees e ON e.id = exception.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY exception.attendance_date DESC NULLS LAST, exception.created_at DESC
    `),
  };
}

function buildAttendanceCorrections(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['adjustment.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'adjustment.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'adjustment.attendance_date', args.query);
  return {
    params,
    sql: compactSql(`
      SELECT adjustment.id AS correction_id, adjustment.attendance_date,
        ${employeeJoinSelect()}, summary.attendance_status AS original_status,
        adjustment.status_override, adjustment.check_in_at_override,
        adjustment.check_out_at_override, adjustment.work_minutes_override,
        adjustment.late_minutes_override, adjustment.early_departure_minutes_override,
        adjustment.overtime_minutes_override, adjustment.notes,
        adjustment.is_active, adjustment.applied_at
      FROM attendance_daily_summary_adjustments adjustment
      JOIN employees e ON e.id = adjustment.employee_id
      ${employeeJoins()}
      LEFT JOIN attendance_daily_summaries summary ON summary.id = adjustment.summary_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY adjustment.attendance_date DESC, adjustment.applied_at DESC
    `),
  };
}

function buildEmployeeHistory(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['history.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'history.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'history.effective_from', args.query);
  return {
    params,
    sql: compactSql(`
      SELECT history.id AS assignment_history_id, ${employeeJoinSelect()},
        department_history.name AS assigned_department,
        history.is_primary, history.effective_from, history.effective_to,
        history.status, history.assignment_reason
      FROM employee_department_assignment_history history
      JOIN employees e ON e.id = history.employee_id
      ${employeeJoins()}
      JOIN departments department_history ON department_history.id = history.department_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY history.effective_from DESC, e.employee_no ASC
    `),
  };
}

function buildAttendanceSummary(kind: string) {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId];
    const conditions = ['summary.company_id = $1'];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'summary.employee_id',
      branchColumn: 'summary.branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    appendDateRange(conditions, params, 'summary.attendance_date', args.query);
    appendOptionalStringFilter(
      conditions,
      params,
      'summary.attendance_status',
      args.query.status,
    );
    if (kind === 'LATE_COMING') conditions.push('summary.late_minutes > 0');
    if (kind === 'EARLY_GOING')
      conditions.push('summary.early_departure_minutes > 0');
    if (kind === 'ABSENTEEISM')
      conditions.push("summary.attendance_status ILIKE 'ABSENT%'");
    if (kind === 'MISSING_PUNCH')
      conditions.push(
        '(summary.check_in_at IS NULL OR summary.check_out_at IS NULL)',
      );
    if (kind === 'OVERTIME') conditions.push('summary.overtime_minutes > 0');
    if (kind === 'OFFICE_ATTENDANCE')
      conditions.push("summary.schedule_source <> 'FIELD'");

    return {
      params,
      sql: compactSql(`
        SELECT summary.attendance_date, ${employeeJoinSelect()},
          summary.schedule_source, summary.attendance_status AS status,
          summary.check_in_at, summary.check_out_at,
          summary.work_minutes, summary.late_minutes,
          summary.early_departure_minutes, summary.overtime_minutes,
          summary.is_adjusted, summary.finalized_at
        FROM attendance_daily_summaries summary
        JOIN employees e ON e.id = summary.employee_id
        ${employeeJoins()}
        WHERE ${conditions.join(' AND ')}
        ORDER BY summary.attendance_date DESC, e.employee_no ASC
      `),
    };
  };
}

function buildLeaveRequestReport(kind: string) {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId];
    const conditions = ['request.company_id = $1'];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'request.employee_id',
      branchColumn: 'e.primary_branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    appendDateRange(conditions, params, 'request.start_date', args.query);
    appendOptionalStringFilter(
      conditions,
      params,
      'request.status',
      args.query.status,
    );
    if (kind === 'LEAVE_AVAILED')
      conditions.push("request.status = 'approved'");
    if (kind === 'LEAVE_WITHOUT_PAY')
      conditions.push(
        "leave_type.code ILIKE '%LWP%' OR leave_type.name ILIKE '%without pay%'",
      );

    return {
      params,
      sql: compactSql(`
        SELECT request.leave_no, ${employeeJoinSelect()}, leave_type.name AS leave_type,
          request.start_date, request.end_date, request.total_days,
          request.duration_type, request.status, request.reason,
          request.current_approval_level, request.approved_at, request.cancelled_at
        FROM leave_requests request
        JOIN employees e ON e.id = request.employee_id
        ${employeeJoins()}
        JOIN leave_types leave_type ON leave_type.id = request.leave_type_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY request.start_date DESC, e.employee_no ASC
      `),
    };
  };
}

function buildDepartmentLeave(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['request.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'request.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'request.start_date', args.query);
  return {
    params,
    sql: compactSql(`
      SELECT department.name AS department, leave_type.name AS leave_type,
        request.status, COUNT(*)::int AS request_count,
        COALESCE(SUM(request.total_days::numeric), 0)::numeric(12,2) AS total_days
      FROM leave_requests request
      JOIN employees e ON e.id = request.employee_id
      ${employeeJoins()}
      JOIN leave_types leave_type ON leave_type.id = request.leave_type_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY department.name, leave_type.name, request.status
      ORDER BY department.name ASC, leave_type.name ASC
    `),
  };
}

function buildFieldVisitReport(kind: string) {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId];
    const conditions = ['visit.company_id = $1'];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'visit.employee_id',
      branchColumn: 'e.primary_branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    appendDateRange(conditions, params, 'visit.visit_date', args.query);
    appendOptionalStringFilter(
      conditions,
      params,
      'visit.status',
      args.query.status,
    );
    if (kind === 'CLIENT_VISIT') conditions.push('party.id IS NOT NULL');

    return {
      params,
      sql: compactSql(`
        SELECT visit.visit_no, visit.visit_date, ${employeeJoinSelect()},
          party.name AS client_or_party, visit.visit_type, visit.status,
          visit.is_unplanned, visit.purpose, visit.outcome,
          visit.check_in_at, visit.check_out_at, visit.duration_minutes,
          visit.manager_review_status, visit.manager_reviewed_at
        FROM field_visits visit
        JOIN employees e ON e.id = visit.employee_id
        ${employeeJoins()}
        LEFT JOIN field_parties party ON party.id = visit.field_party_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY visit.visit_date DESC, visit.visit_no DESC
      `),
    };
  };
}

function buildFieldVisitPlan(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['plan.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'plan.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'plan.visit_date', args.query);
  appendOptionalStringFilter(
    conditions,
    params,
    'plan.status',
    args.query.status,
  );
  return {
    params,
    sql: compactSql(`
      SELECT plan.id AS visit_plan_id, plan.visit_date, ${employeeJoinSelect()},
        plan.status, plan.plan_summary, plan.submitted_at, plan.approved_at,
        plan.completed_at, item.visit_type, item.purpose,
        item.expected_outcome, item.planned_start_time, item.planned_end_time
      FROM field_visit_plans plan
      JOIN employees e ON e.id = plan.employee_id
      ${employeeJoins()}
      LEFT JOIN field_visit_plan_items item ON item.visit_plan_id = plan.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY plan.visit_date DESC, e.employee_no ASC, item.display_order ASC
    `),
  };
}

function buildPlannedVsActualVisit(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['plan.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'plan.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'plan.visit_date', args.query);
  return {
    params,
    sql: compactSql(`
      SELECT plan.visit_date, ${employeeJoinSelect()},
        plan.status AS plan_status,
        COUNT(item.id)::int AS planned_visits,
        COUNT(visit.id)::int AS actual_visits,
        COUNT(visit.id) FILTER (WHERE visit.status IN ('COMPLETED','REVIEWED'))::int AS completed_visits
      FROM field_visit_plans plan
      JOIN employees e ON e.id = plan.employee_id
      ${employeeJoins()}
      LEFT JOIN field_visit_plan_items item ON item.visit_plan_id = plan.id
      LEFT JOIN field_visits visit ON visit.visit_plan_id = plan.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY plan.visit_date, plan.status, e.id, branch.name, department.name, position.name, grade.name, manager.employee_no, manager.first_name, manager.middle_name, manager.last_name
      ORDER BY plan.visit_date DESC, e.employee_no ASC
    `),
  };
}

function buildFieldProductivity(periodType: 'DAILY' | 'MONTHLY' = 'DAILY') {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId, periodType];
    const conditions = ['summary.company_id = $1', 'summary.period_type = $2'];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'summary.employee_id',
      branchColumn: 'e.primary_branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    appendDateRange(conditions, params, 'summary.date_from', args.query);
    return {
      params,
      sql: compactSql(`
        SELECT summary.date_from, summary.date_to, ${employeeJoinSelect()},
          summary.period_type, summary.activity_submission_days,
          summary.completed_activity_count, summary.planned_visit_count,
          summary.completed_visit_count, summary.unplanned_visit_count,
          summary.lead_count, summary.quotation_count,
          summary.business_closed_count, summary.reported_potential_value,
          summary.validated_actual_value, summary.activity_completion_rate,
          summary.visit_completion_rate, summary.submission_discipline_rate
        FROM work_activity_period_summaries summary
        JOIN employees e ON e.id = summary.employee_id
        ${employeeJoins()}
        WHERE ${conditions.join(' AND ')}
        ORDER BY summary.date_from DESC, e.employee_no ASC
      `),
    };
  };
}

function buildActivityReport(kind: string) {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId];
    const conditions = ['report.company_id = $1'];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'report.employee_id',
      branchColumn: 'e.primary_branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    appendDateRange(conditions, params, 'report.activity_date', args.query);
    appendOptionalStringFilter(
      conditions,
      params,
      'report.status',
      args.query.status,
    );
    if (kind === 'PENDING_ACTIVITY') {
      conditions.push("report.status NOT IN ('APPROVED','LOCKED','REVIEWED')");
    }
    return {
      params,
      sql: compactSql(`
        SELECT report.activity_date, ${employeeJoinSelect()},
          report.status AS report_status, report.submitted_at, report.reviewed_at,
          report.manager_rating, report.submission_is_late,
          entry.title AS activity_title, category.name AS activity_category,
          entry.status AS activity_status, entry.priority,
          entry.review_status, entry.completion_percentage,
          entry.outcome, entry.linked_field_visit_id
        FROM daily_activity_reports report
        JOIN employees e ON e.id = report.employee_id
        ${employeeJoins()}
        LEFT JOIN daily_activity_entries entry ON entry.daily_activity_report_id = report.id
        LEFT JOIN activity_categories category ON category.id = entry.activity_category_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY report.activity_date DESC, e.employee_no ASC, entry.id ASC
      `),
    };
  };
}

function buildActivityVsKpi(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['entry.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'report.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'report.activity_date', args.query);
  return {
    params,
    sql: compactSql(`
      SELECT report.activity_date, ${employeeJoinSelect()},
        definition.code AS kpi_code, COALESCE(definition.name, employee_kpi.title) AS kpi_name,
        entry.title AS activity_title, entry.status AS activity_status,
        entry.completion_percentage, entry.outcome, entry.review_status
      FROM daily_activity_entries entry
      JOIN daily_activity_reports report ON report.id = entry.daily_activity_report_id
      JOIN employees e ON e.id = report.employee_id
      ${employeeJoins()}
      LEFT JOIN employee_kpis employee_kpi ON employee_kpi.id = entry.employee_kpi_id
      LEFT JOIN kpi_definitions definition ON definition.id = entry.kpi_definition_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY report.activity_date DESC, e.employee_no ASC
    `),
  };
}

function buildPerformanceAggregateSummary(groupBy: 'department' | 'branch') {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId];
    const conditions = ['aggregate.company_id = $1'];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'aggregate.employee_id',
      branchColumn: 'e.primary_branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    if (args.query.year) {
      conditions.push(
        `aggregate.financial_year_id = ${addParam(params, args.query.year)}`,
      );
    }
    const labelColumn =
      groupBy === 'department' ? 'department.name' : 'branch.name';
    return {
      params,
      sql: compactSql(`
        SELECT ${labelColumn} AS ${groupBy}, aggregate.period_type,
          aggregate.name AS period_name, COUNT(*)::int AS employee_count,
          AVG(aggregate.aggregate_score::numeric)::numeric(12,2) AS average_score,
          MIN(aggregate.aggregate_score::numeric)::numeric(12,2) AS minimum_score,
          MAX(aggregate.aggregate_score::numeric)::numeric(12,2) AS maximum_score
        FROM performance_aggregates aggregate
        JOIN employees e ON e.id = aggregate.employee_id
        ${employeeJoins()}
        WHERE ${conditions.join(' AND ')}
        GROUP BY ${labelColumn}, aggregate.period_type, aggregate.name
        ORDER BY aggregate.name DESC, ${labelColumn} ASC
      `),
    };
  };
}

function buildPerformanceRanking(direction: 'top' | 'low') {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId];
    const conditions = ['aggregate.company_id = $1'];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'aggregate.employee_id',
      branchColumn: 'e.primary_branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    if (args.query.year) {
      conditions.push(
        `aggregate.financial_year_id = ${addParam(params, args.query.year)}`,
      );
    }
    return {
      params,
      sql: compactSql(`
        SELECT ${employeeJoinSelect()}, aggregate.name AS period_name,
          aggregate.period_type, aggregate.aggregate_score AS score,
          aggregate.rating_code, aggregate.published_at, aggregate.locked_at
        FROM performance_aggregates aggregate
        JOIN employees e ON e.id = aggregate.employee_id
        ${employeeJoins()}
        WHERE ${conditions.join(' AND ')}
        ORDER BY aggregate.aggregate_score::numeric ${direction === 'top' ? 'DESC' : 'ASC'}, e.employee_no ASC
      `),
    };
  };
}

function buildPayrollLineItems(kind: string) {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId];
    const conditions = ['item.company_id = $1'];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'item.employee_id',
      branchColumn: 'e.primary_branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    if (kind === 'LOAN_DEDUCTION') {
      conditions.push(
        "(item.component_code ILIKE '%LOAN%' OR item.source_type ILIKE '%FINANCE%')",
      );
    }
    if (kind === 'LWP_DEDUCTION') {
      conditions.push(
        "(item.component_code ILIKE '%LWP%' OR item.component_name ILIKE '%without pay%')",
      );
    }
    if (kind === 'STATUTORY_DEDUCTION') {
      conditions.push(
        "item.component_type IN ('STATUTORY_DEDUCTION','DEDUCTION')",
      );
    }
    return {
      params,
      sql: compactSql(`
        SELECT run.run_no, item.payroll_run_id, ${employeeJoinSelect()},
          item.component_code, item.component_name, item.component_type,
          item.amount, item.taxable_amount, item.employer_amount,
          item.source_type, item.source_reference
        FROM employee_payroll_line_items item
        JOIN payroll_runs run ON run.id = item.payroll_run_id
        JOIN employees e ON e.id = item.employee_id
        ${employeeJoins()}
        WHERE ${conditions.join(' AND ')}
        ORDER BY item.payroll_run_id DESC, e.employee_no ASC, item.calculation_order ASC
      `),
    };
  };
}

function buildPayslipReport(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['payslip.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'payslip.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  return {
    params,
    sql: compactSql(`
      SELECT payslip.payslip_no, run.run_no, ${employeeJoinSelect()},
        result.gross_pay, result.employee_deductions AS deductions,
        result.net_pay, payslip.status, payslip.published_at
      FROM payslips payslip
      JOIN employee_payroll_results result ON result.id = payslip.employee_payroll_result_id
      JOIN payroll_runs run ON run.id = payslip.payroll_run_id
      JOIN employees e ON e.id = payslip.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY payslip.created_at DESC, e.employee_no ASC
    `),
  };
}

function buildPayrollVariance(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['variance.company_id = $1'];
  if (args.query.payroll_run_id) {
    conditions.push(
      `variance.payroll_run_id = ${addParam(params, args.query.payroll_run_id)}`,
    );
  }
  return {
    params,
    sql: compactSql(`
      SELECT variance.payroll_run_id, variance.comparison_run_id,
        variance.variance_total, variance.unexplained_count,
        variance.snapshot, variance.created_at
      FROM payroll_variance_results variance
      WHERE ${conditions.join(' AND ')}
      ORDER BY variance.created_at DESC
    `),
  };
}

function buildSalaryCost(groupBy: 'department' | 'branch') {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId];
    const conditions = [
      'result.company_id = $1',
      "run.status IN ('LOCKED','PAID','CLOSED')",
    ];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'result.employee_id',
      branchColumn: 'e.primary_branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    const labelColumn =
      groupBy === 'department' ? 'department.name' : 'branch.name';
    return {
      params,
      sql: compactSql(`
        SELECT ${labelColumn} AS ${groupBy},
          result.payroll_period_id, COUNT(*)::int AS employee_count,
          SUM(result.gross_pay::numeric)::numeric(18,2) AS gross_pay,
          SUM(result.employee_deductions::numeric)::numeric(18,2) AS deductions,
          SUM(result.net_pay::numeric)::numeric(18,2) AS net_pay,
          SUM(result.employer_cost::numeric)::numeric(18,2) AS employer_cost
        FROM employee_payroll_results result
        JOIN payroll_runs run ON run.id = result.payroll_run_id
        JOIN employees e ON e.id = result.employee_id
        ${employeeJoins()}
        WHERE ${conditions.join(' AND ')}
        GROUP BY ${labelColumn}, result.payroll_period_id
        ORDER BY result.payroll_period_id DESC, ${labelColumn} ASC
      `),
    };
  };
}

function buildFinalSettlementReport(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['settlement.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'settlement.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendOptionalStringFilter(
    conditions,
    params,
    'settlement.status',
    args.query.status,
  );
  return {
    params,
    sql: compactSql(`
      SELECT settlement.id AS settlement_id, ${employeeJoinSelect()},
        request.offboarding_code, settlement.gross_settlement,
        settlement.deduction_total, settlement.net_settlement,
        settlement.status, settlement.created_at
      FROM payroll_final_settlements settlement
      JOIN employees e ON e.id = settlement.employee_id
      ${employeeJoins()}
      LEFT JOIN offboarding_requests request ON request.id = settlement.offboarding_request_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY settlement.created_at DESC
    `),
  };
}

function buildLoanApplicationReport(kind: string) {
  return (args: OperationalReportQueryArgs) => {
    const params: unknown[] = [args.companyId];
    const conditions = ['application.company_id = $1'];
    appendScopedEmployeeFilters(conditions, params, args.scope, {
      employeeColumn: 'application.employee_id',
      branchColumn: 'e.primary_branch_id',
      departmentColumn: 'e.primary_department_id',
    });
    appendDateRange(
      conditions,
      params,
      'application.created_at::date',
      args.query,
    );
    appendOptionalStringFilter(
      conditions,
      params,
      'application.status',
      args.query.status,
    );
    if (kind === 'LOAN_APPROVAL') conditions.push('approval.id IS NOT NULL');
    return {
      params,
      sql: compactSql(`
        SELECT application.application_no, application.product_type,
          ${employeeJoinSelect()}, application.requested_amount,
          application.requested_term_months, application.approved_amount,
          application.approved_term_months, application.status,
          application.submitted_at, application.approved_at,
          approval.stage AS approval_stage, approval.decision AS approval_decision,
          approval.created_at AS approval_recorded_at
        FROM employee_finance_applications application
        JOIN employees e ON e.id = application.employee_id
        ${employeeJoins()}
        LEFT JOIN employee_finance_application_approvals approval
          ON approval.application_id = application.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY application.created_at DESC, application.application_no DESC
      `),
    };
  };
}

function buildActiveLoanReport(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = [
    'account.company_id = $1',
    "account.status IN ('ACTIVE','IN_ARREARS','PENDING_DISBURSEMENT')",
  ];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'account.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  return {
    params,
    sql: compactSql(`
      SELECT account.account_no AS loan_reference, ${employeeJoinSelect()},
        account.product_type, account.principal_amount,
        account.total_payable, account.outstanding_total,
        account.scheduled_monthly_installment, account.term_months,
        account.disbursed_at, account.maturity_date, account.status
      FROM employee_finance_accounts account
      JOIN employees e ON e.id = account.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY account.maturity_date ASC, e.employee_no ASC
    `),
  };
}

function buildMonthlyLoanDeduction(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['installment.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'installment.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'installment.due_date', args.query);
  appendOptionalStringFilter(
    conditions,
    params,
    'installment.status',
    args.query.status,
  );
  return {
    params,
    sql: compactSql(`
      SELECT account.account_no AS loan_reference, ${employeeJoinSelect()},
        installment.installment_number, installment.due_date,
        installment.principal_due, installment.interest_due,
        installment.fee_due, installment.total_due,
        installment.paid_amount, installment.status,
        installment.payroll_period_id
      FROM employee_finance_installments installment
      JOIN employee_finance_accounts account ON account.id = installment.account_id
      JOIN employees e ON e.id = installment.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY installment.due_date DESC, e.employee_no ASC
    `),
  };
}

function buildLoanSettlementReport(args: OperationalReportQueryArgs) {
  const params: unknown[] = [args.companyId];
  const conditions = ['quote.company_id = $1'];
  appendScopedEmployeeFilters(conditions, params, args.scope, {
    employeeColumn: 'account.employee_id',
    branchColumn: 'e.primary_branch_id',
    departmentColumn: 'e.primary_department_id',
  });
  appendDateRange(conditions, params, 'quote.valid_until', args.query);
  return {
    params,
    sql: compactSql(`
      SELECT account.account_no AS loan_reference, ${employeeJoinSelect()},
        quote.quote_no, quote.valid_until, quote.settlement_amount,
        account.outstanding_principal, account.outstanding_interest,
        account.outstanding_fees, account.outstanding_total,
        quote.status, quote.snapshot
      FROM employee_finance_settlement_quotes quote
      JOIN employee_finance_accounts account ON account.id = quote.account_id
      JOIN employees e ON e.id = account.employee_id
      ${employeeJoins()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY quote.valid_until DESC, e.employee_no ASC
    `),
  };
}

export const OPERATIONAL_REPORTS: OperationalReportDefinition[] = [
  {
    code: 'EMPLOYEE_MASTER',
    name: 'Employee Master Report',
    category: 'Employee Reports',
    permissions: ['employee_reports.view', 'employees:read', 'reports.view'],
    sensitivity: AnalyticsSensitivityEnum.INTERNAL,
    build: buildEmployeeMaster,
  },
  {
    code: 'NEW_JOINERS',
    name: 'New Joiner Report',
    category: 'Employee Reports',
    permissions: ['employee_reports.view', 'employees:read', 'reports.view'],
    sensitivity: AnalyticsSensitivityEnum.INTERNAL,
    build: buildNewJoiners,
  },
  {
    code: 'CONFIRMATION_DUE',
    name: 'Confirmation Due Report',
    category: 'Employee Reports',
    permissions: [
      'employee_reports.view',
      'probation_cases:read',
      'reports.view',
    ],
    sensitivity: AnalyticsSensitivityEnum.INTERNAL,
    build: buildConfirmationDue,
  },
  {
    code: 'PROBATION',
    name: 'Probation Report',
    category: 'Employee Reports',
    permissions: [
      'employee_reports.view',
      'probation_cases:read',
      'reports.view',
    ],
    sensitivity: AnalyticsSensitivityEnum.INTERNAL,
    build: buildProbation,
  },
  {
    code: 'TRANSFERS',
    name: 'Transfer Report',
    category: 'Employee Reports',
    permissions: [
      'employee_reports.view',
      'employee_movements:read',
      'reports.view',
    ],
    sensitivity: AnalyticsSensitivityEnum.INTERNAL,
    build: movementReport(['DEPARTMENT_TRANSFER', 'BRANCH_TRANSFER']),
  },
  {
    code: 'PROMOTIONS',
    name: 'Promotion Report',
    category: 'Employee Reports',
    permissions: [
      'employee_reports.view',
      'employee_movements:read',
      'reports.view',
    ],
    sensitivity: AnalyticsSensitivityEnum.INTERNAL,
    build: movementReport(['PROMOTION']),
  },
  {
    code: 'RESIGNATIONS',
    name: 'Resignation Report',
    category: 'Employee Reports',
    permissions: [
      'employee_reports.view',
      'offboarding:read',
      'offboarding_requests:read',
      'reports.view',
    ],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: offboardingReport(true),
  },
  {
    code: 'EXITS',
    name: 'Exit Report',
    category: 'Employee Reports',
    permissions: [
      'employee_reports.view',
      'offboarding:read',
      'offboarding_requests:read',
      'reports.view',
    ],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: offboardingReport(false),
  },
  {
    code: 'EMPLOYEE_DOCUMENTS',
    name: 'Employee Document Report',
    category: 'Employee Reports',
    permissions: [
      'employee_reports.view',
      'hr_documents:read',
      'employees:read',
      'reports.view',
    ],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildEmployeeDocuments,
  },
  {
    code: 'EMPLOYEE_HISTORY',
    name: 'Employee History Report',
    category: 'Employee Reports',
    permissions: [
      'employee_reports.view',
      'employee_assignments:read',
      'reports.view',
    ],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildEmployeeHistory,
  },
  {
    code: 'DAILY_ATTENDANCE',
    name: 'Daily Attendance',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'attendance_summaries:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildAttendanceSummary('DAILY_ATTENDANCE'),
  },
  {
    code: 'MONTHLY_ATTENDANCE',
    name: 'Monthly Attendance',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'attendance_summaries:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildAttendanceSummary('MONTHLY_ATTENDANCE'),
  },
  {
    code: 'LATE_COMING',
    name: 'Late Coming Report',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'attendance_summaries:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildAttendanceSummary('LATE_COMING'),
  },
  {
    code: 'EARLY_GOING',
    name: 'Early Going Report',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'attendance_summaries:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildAttendanceSummary('EARLY_GOING'),
  },
  {
    code: 'ABSENTEEISM',
    name: 'Absenteeism Report',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'attendance_summaries:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildAttendanceSummary('ABSENTEEISM'),
  },
  {
    code: 'MISSING_PUNCH',
    name: 'Missing Punch Report',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'attendance_summaries:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildAttendanceSummary('MISSING_PUNCH'),
  },
  {
    code: 'OVERTIME',
    name: 'Overtime Report',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'attendance_summaries:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildAttendanceSummary('OVERTIME'),
  },
  {
    code: 'OFFICE_ATTENDANCE',
    name: 'Office Attendance Report',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'attendance_summaries:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildAttendanceSummary('OFFICE_ATTENDANCE'),
  },
  {
    code: 'FIELD_ATTENDANCE_GEOLOCATION',
    name: 'Field Attendance with Geolocation',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'field_locations:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildFieldVisitMap,
  },
  {
    code: 'LEAVE_BALANCE',
    name: 'Leave Balance Report',
    category: 'Leave Reports',
    permissions: [
      'leave_reports.view',
      'leave-balances.view',
      'leave_balances:read',
    ],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildLeaveBalances,
  },
  {
    code: 'LEAVE_PENDING_APPROVAL',
    name: 'Leave Pending Approval Report',
    category: 'Leave Reports',
    permissions: ['leave_reports.view', 'leave_requests:read'],
    sensitivity: AnalyticsSensitivityEnum.INTERNAL,
    build: buildLeavePending,
  },
  {
    code: 'LEAVE_AVAILED',
    name: 'Leave Availed Report',
    category: 'Leave Reports',
    permissions: ['leave_reports.view', 'leave_requests:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildLeaveRequestReport('LEAVE_AVAILED'),
  },
  {
    code: 'LEAVE_WITHOUT_PAY',
    name: 'Leave Without Pay Report',
    category: 'Leave Reports',
    permissions: ['leave_reports.view', 'leave_requests:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildLeaveRequestReport('LEAVE_WITHOUT_PAY'),
  },
  {
    code: 'DEPARTMENT_LEAVE',
    name: 'Department-wise Leave Report',
    category: 'Leave Reports',
    permissions: ['leave_reports.view', 'leave_requests:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildDepartmentLeave,
  },
  {
    code: 'EMPLOYEE_LEAVE_HISTORY',
    name: 'Employee-wise Leave History',
    category: 'Leave Reports',
    permissions: ['leave_reports.view', 'leave_requests:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildLeaveRequestReport('EMPLOYEE_LEAVE_HISTORY'),
  },
  {
    code: 'PAYROLL_REGISTER',
    name: 'Payroll Register',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'payroll:reports'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildPayrollRegister,
  },
  {
    code: 'BANK_TRANSFER',
    name: 'Bank Transfer Report',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'payroll:banking'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildBankTransfer,
  },
  {
    code: 'LOAN_OUTSTANDING',
    name: 'Loan Outstanding Report',
    category: 'Staff Loan Reports',
    permissions: ['loan_reports.view', 'employee_finance:reports'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildLoanOutstanding,
  },
  {
    code: 'LOAN_APPLICATION',
    name: 'Loan Application Report',
    category: 'Staff Loan Reports',
    permissions: ['loan_reports.view', 'employee_finance:applications:read'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildLoanApplicationReport('LOAN_APPLICATION'),
  },
  {
    code: 'LOAN_APPROVAL',
    name: 'Loan Approval Report',
    category: 'Staff Loan Reports',
    permissions: ['loan_reports.view', 'employee_finance:applications:read'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildLoanApplicationReport('LOAN_APPROVAL'),
  },
  {
    code: 'ACTIVE_LOAN',
    name: 'Active Loan Report',
    category: 'Staff Loan Reports',
    permissions: ['loan_reports.view', 'employee_finance:accounts:read'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildActiveLoanReport,
  },
  {
    code: 'MONTHLY_LOAN_DEDUCTION',
    name: 'Monthly Deduction Report',
    category: 'Staff Loan Reports',
    permissions: ['loan_reports.view', 'employee_finance:reports'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildMonthlyLoanDeduction,
  },
  {
    code: 'LOAN_SETTLEMENT',
    name: 'Loan Settlement Report',
    category: 'Staff Loan Reports',
    permissions: ['loan_reports.view', 'employee_finance:settlements'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildLoanSettlementReport,
  },
  {
    code: 'FIELD_VISIT_MAP',
    name: 'Map-Based Movement / Visit Report',
    category: 'Field Staff Reports',
    permissions: ['field_reports.view', 'field_locations:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildFieldVisitMap,
  },
  {
    code: 'GEOLOCATION_ATTENDANCE',
    name: 'Geolocation Attendance Report',
    category: 'Field Staff Reports',
    permissions: ['field_reports.view', 'field_locations:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildFieldVisitMap,
  },
  {
    code: 'VISIT_PLAN',
    name: 'Visit Plan Report',
    category: 'Field Staff Reports',
    permissions: ['field_reports.view', 'field_visits:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildFieldVisitPlan,
  },
  {
    code: 'ACTUAL_VISIT',
    name: 'Actual Visit Report',
    category: 'Field Staff Reports',
    permissions: ['field_reports.view', 'field_visits:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildFieldVisitReport('ACTUAL_VISIT'),
  },
  {
    code: 'PLANNED_VS_ACTUAL_VISIT',
    name: 'Planned vs Actual Visit Report',
    category: 'Field Staff Reports',
    permissions: ['field_reports.view', 'field_visits:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildPlannedVsActualVisit,
  },
  {
    code: 'CLIENT_VISIT',
    name: 'Client Visit Report',
    category: 'Field Staff Reports',
    permissions: ['field_reports.view', 'field_visits:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildFieldVisitReport('CLIENT_VISIT'),
  },
  {
    code: 'FIELD_PRODUCTIVITY',
    name: 'Field Productivity Report',
    category: 'Field Staff Reports',
    permissions: ['field_reports.view', 'field_visits:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildFieldProductivity('DAILY'),
  },
  {
    code: 'MAP_VISITS',
    name: 'Map-Based Movement / Visit Report',
    category: 'Field Staff Reports',
    permissions: ['field_reports.view', 'field_locations:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildFieldVisitMap,
  },
  {
    code: 'ATTENDANCE_WITHOUT_ACTIVITY',
    name: 'Attendance Without Activity Exception Report',
    category: 'Field Staff Reports',
    permissions: ['field_reports.view', 'work_activities:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildActivityReport('PENDING_ACTIVITY'),
  },
  {
    code: 'FIELD_MONTHLY_PRODUCTIVITY',
    name: 'Field Staff Monthly Productivity Report',
    category: 'Field Staff Reports',
    permissions: ['field_reports.view', 'field_visits:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildFieldProductivity('MONTHLY'),
  },
  {
    code: 'DAILY_ACTIVITY',
    name: 'Daily Activity Report',
    category: 'Activity Reports',
    permissions: ['activity_reports.view', 'work_activities:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildActivityReport('DAILY_ACTIVITY'),
  },
  {
    code: 'WEEKLY_ACTIVITY',
    name: 'Weekly Activity Report',
    category: 'Activity Reports',
    permissions: ['activity_reports.view', 'work_activities:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildActivityReport('WEEKLY_ACTIVITY'),
  },
  {
    code: 'MONTHLY_ACTIVITY',
    name: 'Monthly Activity Report',
    category: 'Activity Reports',
    permissions: ['activity_reports.view', 'work_activities:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildActivityReport('MONTHLY_ACTIVITY'),
  },
  {
    code: 'QUARTERLY_ACTIVITY',
    name: 'Quarterly Activity Report',
    category: 'Activity Reports',
    permissions: ['activity_reports.view', 'work_activities:hr:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildActivityReport('QUARTERLY_ACTIVITY'),
  },
  {
    code: 'PENDING_ACTIVITY',
    name: 'Pending Activity Report',
    category: 'Activity Reports',
    permissions: ['activity_reports.view', 'work_activities:manager:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildActivityReport('PENDING_ACTIVITY'),
  },
  {
    code: 'MANAGER_REVIEW',
    name: 'Manager Review Report',
    category: 'Activity Reports',
    permissions: ['activity_reports.view', 'work_activities:manager:review'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildActivityReport('MANAGER_REVIEW'),
  },
  {
    code: 'ACTIVITY_VS_KPI',
    name: 'Activity vs KPI Report',
    category: 'Activity Reports',
    permissions: [
      'activity_reports.view',
      'performance_kpis:read',
      'performance_kpis:all:read',
    ],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildActivityVsKpi,
  },
  {
    code: 'KPI_ASSIGNMENTS',
    name: 'Employee KPI Assignment Report',
    category: 'KPI & Performance Reports',
    permissions: [
      'performance_reports.view',
      'performance_kpis:read',
      'performance_kpis:all:read',
    ],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildKpiAssignments,
  },
  {
    code: 'KPI_TARGET_VS_ACHIEVEMENT',
    name: 'Monthly KPI Target vs Achievement',
    category: 'KPI & Performance Reports',
    permissions: [
      'performance_reports.view',
      'performance_kpis:read',
      'performance_kpis:all:read',
    ],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: (args) => buildKpiTargetAchievement(args, false),
  },
  {
    code: 'MONTHLY_KPI_SCORE',
    name: 'Monthly KPI Score',
    category: 'KPI & Performance Reports',
    permissions: ['performance_reports.view', 'performance_reports:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: (args) => buildKpiTargetAchievement(args, true),
  },
  {
    code: 'QUARTERLY_KPI_AVERAGE',
    name: 'Quarterly KPI Average',
    category: 'KPI & Performance Reports',
    permissions: ['performance_reports.view', 'performance_aggregates:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: (args) => buildPerformanceAggregate(args, 'QUARTERLY'),
  },
  {
    code: 'ANNUAL_KPI_AVERAGE',
    name: 'Annual KPI Average',
    category: 'KPI & Performance Reports',
    permissions: ['performance_reports.view', 'performance_aggregates:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: (args) => buildPerformanceAggregate(args, 'ANNUAL'),
  },
  {
    code: 'KPI_SCORE_HISTORY',
    name: 'KPI Score History',
    category: 'KPI & Performance Reports',
    permissions: ['performance_reports.view', 'performance_reports:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildKpiScoreHistory,
  },
  {
    code: 'DEPARTMENT_PERFORMANCE',
    name: 'Department-wise Performance',
    category: 'KPI & Performance Reports',
    permissions: ['performance_reports.view', 'performance_dashboards:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildPerformanceAggregateSummary('department'),
  },
  {
    code: 'BRANCH_PERFORMANCE',
    name: 'Branch-wise Performance',
    category: 'KPI & Performance Reports',
    permissions: ['performance_reports.view', 'performance_dashboards:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildPerformanceAggregateSummary('branch'),
  },
  {
    code: 'TOP_PERFORMERS',
    name: 'Top Performer Report',
    category: 'KPI & Performance Reports',
    permissions: ['performance_reports.view', 'performance_reports:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildPerformanceRanking('top'),
  },
  {
    code: 'LOW_PERFORMERS',
    name: 'Low Performer Report',
    category: 'KPI & Performance Reports',
    permissions: ['performance_reports.view', 'performance_reports:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildPerformanceRanking('low'),
  },
  {
    code: 'PERFORMANCE_TREND',
    name: 'Performance Trend Report',
    category: 'KPI & Performance Reports',
    permissions: ['performance_reports.view', 'performance_reports:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildKpiScoreHistory,
  },
  {
    code: 'EMPLOYEE_PERFORMANCE_DASHBOARD',
    name: 'Employee Performance Dashboard',
    category: 'KPI & Performance Reports',
    permissions: ['performance_reports.view', 'performance_self_service:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildKpiScoreHistory,
  },
  {
    code: 'ATTENDANCE_EXCEPTIONS',
    name: 'Attendance Exception Report',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'attendance_summaries:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildAttendanceExceptions,
  },
  {
    code: 'ATTENDANCE_CORRECTIONS',
    name: 'Attendance Correction Report',
    category: 'Attendance Reports',
    permissions: ['attendance_reports.view', 'attendance_summaries:read'],
    sensitivity: AnalyticsSensitivityEnum.CONFIDENTIAL,
    build: buildAttendanceCorrections,
  },
  {
    code: 'SALARY_SHEET',
    name: 'Salary Sheet',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'payroll:reports'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildPayrollRegister,
  },
  {
    code: 'PAYSLIP',
    name: 'Payslip Report',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'payroll:payslips:read'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildPayslipReport,
  },
  {
    code: 'PAYROLL_VARIANCE',
    name: 'Payroll Variance Report',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'payroll:reports'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildPayrollVariance,
  },
  {
    code: 'SALARY_COST_DEPARTMENT',
    name: 'Salary Cost by Department',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'payroll:reports'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildSalaryCost('department'),
  },
  {
    code: 'SALARY_COST_BRANCH',
    name: 'Salary Cost by Branch',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'payroll:reports'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildSalaryCost('branch'),
  },
  {
    code: 'LOAN_DEDUCTION',
    name: 'Loan Deduction Report',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'payroll:reports'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildPayrollLineItems('LOAN_DEDUCTION'),
  },
  {
    code: 'LWP_DEDUCTION',
    name: 'Leave Without Pay Deduction Report',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'payroll:reports'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildPayrollLineItems('LWP_DEDUCTION'),
  },
  {
    code: 'STATUTORY_DEDUCTION',
    name: 'Statutory Deduction Report',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'analytics:statutory-reports'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildPayrollLineItems('STATUTORY_DEDUCTION'),
  },
  {
    code: 'FINAL_SETTLEMENT',
    name: 'Full and Final Settlement Report',
    category: 'Payroll Reports',
    permissions: ['payroll_reports.view', 'payroll:final-settlements'],
    sensitivity: AnalyticsSensitivityEnum.HIGHLY_RESTRICTED,
    build: buildFinalSettlementReport,
  },
];

@Injectable()
export class AnalyticsOperationalReportService {
  private readonly definitions = new Map(
    OPERATIONAL_REPORTS.map((definition) => [definition.code, definition]),
  );

  constructor(
    private readonly auditService: AnalyticsAuditService,
    private readonly scopeService: AnalyticsScopeService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly employeeFinanceLedgerService: EmployeeFinanceLedgerService,
    private readonly performanceScoringService: PerformanceScoringService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  listDefinitions() {
    return OPERATIONAL_REPORTS.map((definition) => ({
      code: definition.code,
      name: definition.name,
      category: definition.category,
      required_permissions: definition.permissions,
      sensitivity: definition.sensitivity,
      exports: ['CSV', 'XLSX', 'PDF', 'JSON'],
      implementation_status: 'DEDICATED_OPERATIONAL_RUNNER',
    }));
  }

  async run(
    actor: AuthenticatedUser,
    code: string,
    query: AnalyticsOperationalReportQueryDto,
  ) {
    const definition = this.requireDefinition(actor, code);
    const scope = await this.scopeService.resolve(actor, query);
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(Math.max(1, Number(query.limit ?? 50)), 5000);
    const built = definition.build({
      companyId: actor.companyId!,
      scope,
      query,
    });
    const countRows = await queryRows<{ total: unknown }>(
      this.dataSource,
      `SELECT COUNT(*) AS total FROM (${built.sql}) report_rows`,
      built.params,
    );
    const rawRows = await queryRows<AnalyticsQueryRow>(
      this.dataSource,
      `${built.sql} LIMIT ${addParam(built.params, limit)} OFFSET ${addParam(
        built.params,
        (page - 1) * limit,
      )}`,
      built.params,
    );
    const rows = await this.enrichRows(
      definition.code,
      rawRows,
      actor.companyId!,
    );
    await this.auditService.log({
      actor,
      action: 'analytics.operational_report.run',
      resourceType: 'OPERATIONAL_REPORT',
      resourceCode: definition.code,
      scopeHash: scope.scopeHash,
      sensitivity: definition.sensitivity,
      metadata: {
        filters: query,
        row_count: rows.length,
        total: numberFrom(countRows[0]?.total),
      },
    });
    return {
      report_code: definition.code,
      report_name: definition.name,
      rows,
      row_count: rows.length,
      total: numberFrom(countRows[0]?.total),
      page,
      limit,
      source_policy:
        definition.sensitivity === AnalyticsSensitivityEnum.HIGHLY_RESTRICTED
          ? 'FINALIZED_OR_POSTED_SOURCE_RECORDS_ONLY'
          : 'LIVE_OPERATIONAL_SOURCE_RECORDS',
    };
  }

  async export(
    actor: AuthenticatedUser,
    code: string,
    query: AnalyticsOperationalReportQueryDto,
  ) {
    const definition = this.requireDefinition(actor, code);
    const scope = await this.scopeService.resolve(actor, query);
    const file = await this.createExportFile(
      definition,
      actor.companyId!,
      scope,
      query,
    );
    await this.auditService.log({
      actor,
      action: 'analytics.operational_report.export',
      resourceType: 'OPERATIONAL_REPORT',
      resourceCode: definition.code,
      scopeHash: scope.scopeHash,
      sensitivity: definition.sensitivity,
      metadata: {
        filters: query,
        row_count: file.recordCount,
        output_format: query.output_format ?? 'XLSX',
      },
    });
    return file;
  }

  async exportForCompany(
    companyId: number,
    code: string,
    query: AnalyticsOperationalReportQueryDto,
  ) {
    const definition = this.getDefinition(code);
    const scope = this.fullCompanyScope(companyId, query);
    return this.createExportFile(definition, companyId, scope, query);
  }

  private async createExportFile(
    definition: OperationalReportDefinition,
    companyId: number,
    scope: AnalyticsResolvedScope,
    query: AnalyticsOperationalReportQueryDto,
  ) {
    const built = definition.build({
      companyId,
      scope,
      query: { ...query, page: 1, limit: 50000 },
    });
    const rawRows = await queryRows<AnalyticsQueryRow>(
      this.dataSource,
      `${built.sql} LIMIT ${addParam(built.params, 50000)}`,
      built.params,
    );
    const rows = await this.enrichRows(definition.code, rawRows, companyId);
    const format = (query.output_format ?? 'XLSX').toUpperCase();
    const typedRows = rows as Record<string, unknown>[];
    const buffer =
      format === 'JSON'
        ? Buffer.from(JSON.stringify(typedRows, null, 2), 'utf8')
        : format === 'CSV'
          ? Buffer.from(serializeCsv(typedRows), 'utf8')
          : format === 'PDF'
            ? await serializePdf(typedRows, definition.name)
            : await serializeXlsx(typedRows);
    const extension =
      format === 'JSON'
        ? 'json'
        : format === 'CSV'
          ? 'csv'
          : format === 'PDF'
            ? 'pdf'
            : 'xlsx';
    return {
      filename: `${sanitizeFilenamePart(definition.code.toLowerCase())}-${new Date()
        .toISOString()
        .slice(0, 10)}.${extension}`,
      mimeType:
        format === 'JSON'
          ? 'application/json'
          : format === 'CSV'
            ? 'text/csv'
            : format === 'PDF'
              ? 'application/pdf'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
      recordCount: rows.length,
    };
  }

  private getDefinition(code: string) {
    const definition = this.definitions.get(code.trim().toUpperCase());
    if (!definition) {
      throw new NotFoundException(`Report "${code}" is not implemented.`);
    }
    return definition;
  }

  private async enrichRows(
    code: string,
    rows: AnalyticsQueryRow[],
    companyId: number,
  ) {
    if (code === 'LEAVE_BALANCE') {
      return rows.map((row) => {
        const balanceLike = {
          opening_balance_days: row.opening_balance_days,
          carried_forward_days: row.carried_forward_days,
          accrued_days: row.accrued_days,
          entitlement_days: row.entitlement_days,
          allocated_days: row.allocated_days,
          adjusted_days: row.adjusted_days,
          used_days: row.used,
          pending_days: row.pending,
          approved_future_days: row.approved_future_days,
          expired_days: row.expired_days,
          attendance_deduction_days: row.attendance_deduction_days,
        };
        return {
          ...row,
          remaining_balance: this.leaveBalanceService.calculateAvailableDays(
            balanceLike as never,
          ),
          calculation_source: 'LeaveBalanceService.calculateAvailableDays',
        };
      });
    }

    if (code === 'LOAN_OUTSTANDING') {
      const enriched: AnalyticsQueryRow[] = [];
      for (const row of rows) {
        const accountId = Number(row.account_id);
        if (!Number.isFinite(accountId)) {
          enriched.push(row);
          continue;
        }
        const balance = await this.employeeFinanceLedgerService
          .calculateBalance(companyId, accountId)
          .catch(() => null);
        enriched.push({
          ...row,
          ledger_principal: balance?.principal ?? row.outstanding_principal,
          ledger_interest: balance?.interest ?? row.outstanding_interest,
          ledger_fees: balance?.fees ?? row.outstanding_fees,
          outstanding_amount: balance?.total ?? row.outstanding_amount,
          calculation_source: balance
            ? 'EmployeeFinanceLedgerService.calculateBalance'
            : 'employee_finance_accounts.outstanding_total',
        });
      }
      return enriched;
    }

    if (code === 'KPI_TARGET_VS_ACHIEVEMENT' || code === 'MONTHLY_KPI_SCORE') {
      return rows.map((row) => {
        const formula =
          typeof row.scoring_formula === 'string'
            ? (row.scoring_formula as KpiScoringFormulaEnum)
            : KpiScoringFormulaEnum.PERCENT_TO_TARGET;
        const scoring = this.performanceScoringService.score({
          formula,
          targetValue: row.target_value as string | number | null,
          achievementValue: row.achievement_value as string | number | null,
          weight: (row.weight as string | number | null) ?? 100,
          formulaConfiguration:
            (row.formula_configuration as Record<string, unknown> | null) ??
            null,
        });
        return {
          ...row,
          raw_score: scoring.rawScore,
          capped_score: scoring.cappedScore,
          weighted_score: scoring.weightedScore,
          calculation_source: 'PerformanceScoringService.score',
        };
      });
    }

    return rows;
  }

  private fullCompanyScope(
    companyId: number,
    query: AnalyticsOperationalReportQueryDto,
  ): AnalyticsResolvedScope {
    const scope = {
      companyId,
      employeeIds: null,
      branchId: query.branch_id ?? null,
      departmentId: query.department_id ?? null,
      employeeId: query.employee_id ?? null,
    };
    return {
      ...scope,
      scopeHash: createHash('sha256')
        .update(JSON.stringify(scope))
        .digest('hex'),
    };
  }

  private requireDefinition(actor: AuthenticatedUser, code: string) {
    const definition = this.getDefinition(code);
    const allowed = definition.permissions.some((permission) =>
      hasPermission(actor.permissions, permission),
    );
    if (!allowed) {
      throw new BadRequestException(
        'You do not have permission to run this report.',
      );
    }
    return definition;
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
