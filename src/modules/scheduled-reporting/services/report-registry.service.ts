import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportRunner } from '../interfaces/report-runner.interface';
import { AttendanceSummaryReportRunner } from './runners/attendance-summary-report-runner.service';
import { EmployeeMasterReportRunner } from './runners/employee-master-report-runner.service';
import { EndOfDayAttendanceReportRunner } from './runners/end-of-day-attendance-report-runner.service';
import { MorningAttendanceReportRunner } from './runners/morning-attendance-report-runner.service';
import { OperationalAnalyticsReportRunner } from './runners/operational-analytics-report-runner.service';
import { PerformanceSummaryReportRunner } from './runners/performance-summary-report-runner.service';

export type RegisteredReportDefinition = {
  reportCode: string;
  name: string;
  description: string | null;
  supportedFormats: ReportOutputFormatEnum[];
  supportedFilterFields: string[];
  requiredPermissions: string[];
  emailDeliverySupported: boolean;
  backgroundGenerationSupported: boolean;
  generatorService: string;
};

const OPERATIONAL_FILTER_FIELDS = [
  'company_id',
  'branch_id',
  'department_id',
  'employee_id',
  'employment_status',
  'status',
  'approval_status',
  'payroll_period_id',
  'payroll_run_id',
  'month',
  'quarter',
  'year',
  'date_from',
  'date_to',
];

const operationalDefinition = (
  reportCode: string,
  name: string,
  requiredPermissions: string[],
  description: string | null = null,
): RegisteredReportDefinition => ({
  reportCode,
  name,
  description,
  supportedFormats: [
    ReportOutputFormatEnum.PDF,
    ReportOutputFormatEnum.XLSX,
    ReportOutputFormatEnum.CSV,
  ],
  supportedFilterFields: OPERATIONAL_FILTER_FIELDS,
  requiredPermissions,
  emailDeliverySupported: true,
  backgroundGenerationSupported: false,
  generatorService: 'OperationalAnalyticsReportRunner',
});

export const REGISTERED_REPORT_DEFINITIONS: RegisteredReportDefinition[] = [
  {
    reportCode: 'ATTENDANCE_SUMMARY',
    name: 'Attendance Summary',
    description:
      'Attendance summary export covering employee attendance outcomes within the selected date range.',
    supportedFormats: [
      ReportOutputFormatEnum.PDF,
      ReportOutputFormatEnum.XLSX,
      ReportOutputFormatEnum.CSV,
    ],
    supportedFilterFields: [
      'company_id',
      'branch_id',
      'department_id',
      'employee_id',
      'employee_no',
      'attendance_status',
      'date_from',
      'date_to',
      'late_only',
      'early_checkout_only',
      'missing_check_in',
      'missing_check_out',
      'present_only',
      'absent_only',
    ],
    requiredPermissions: ['attendance_summaries:read'],
    emailDeliverySupported: true,
    backgroundGenerationSupported: false,
    generatorService: 'AttendanceSummaryReportRunner',
  },
  {
    reportCode: 'EMPLOYEE_DIRECTORY',
    name: 'Employee Directory',
    description:
      'Employee directory export containing employee master data, status, and organization assignment details.',
    supportedFormats: [ReportOutputFormatEnum.CSV],
    supportedFilterFields: [
      'company_id',
      'branch_id',
      'department_id',
      'employee_id',
      'employee_no',
      'employment_status',
      'employment_type',
    ],
    requiredPermissions: ['employees:read'],
    emailDeliverySupported: true,
    backgroundGenerationSupported: false,
    generatorService: 'EmployeeMasterReportRunner',
  },
  {
    reportCode: 'PERFORMANCE_SUMMARY',
    name: 'Performance Summary',
    description:
      'Performance summary export aggregating financial-year and period-based performance review results.',
    supportedFormats: [ReportOutputFormatEnum.CSV],
    supportedFilterFields: [
      'company_id',
      'employee_id',
      'department_id',
      'branch_id',
      'financial_year_id',
      'period_type',
    ],
    requiredPermissions: ['performance_dashboards:read'],
    emailDeliverySupported: true,
    backgroundGenerationSupported: false,
    generatorService: 'PerformanceSummaryReportRunner',
  },
  {
    reportCode: 'MORNING_ATTENDANCE',
    name: 'Morning Attendance Report',
    description:
      'Morning snapshot of who has checked in, who is late, and who has not yet checked in for the day.',
    supportedFormats: [ReportOutputFormatEnum.XLSX, ReportOutputFormatEnum.CSV],
    supportedFilterFields: ['branch_id', 'department_id'],
    requiredPermissions: ['attendance_summaries:read'],
    emailDeliverySupported: true,
    backgroundGenerationSupported: false,
    generatorService: 'MorningAttendanceReportRunner',
  },
  {
    reportCode: 'END_OF_DAY_ATTENDANCE',
    name: 'End of Day Attendance Report',
    description:
      'End-of-day attendance snapshot summarizing check-ins, check-outs, absences, and exceptions for the day.',
    supportedFormats: [ReportOutputFormatEnum.XLSX, ReportOutputFormatEnum.CSV],
    supportedFilterFields: ['branch_id', 'department_id'],
    requiredPermissions: ['attendance_summaries:read'],
    emailDeliverySupported: true,
    backgroundGenerationSupported: false,
    generatorService: 'EndOfDayAttendanceReportRunner',
  },
  operationalDefinition('EMPLOYEE_MASTER', 'Employee Master Report', [
    'employee_reports.view',
    'employees:read',
  ]),
  operationalDefinition('NEW_JOINERS', 'New Joiner Report', [
    'employee_reports.view',
    'employees:read',
  ]),
  operationalDefinition('CONFIRMATION_DUE', 'Confirmation Due Report', [
    'employee_reports.view',
    'probation_cases:read',
  ]),
  operationalDefinition('PROBATION', 'Probation Report', [
    'employee_reports.view',
    'probation_cases:read',
  ]),
  operationalDefinition('TRANSFERS', 'Transfer Report', [
    'employee_reports.view',
    'employee_movements:read',
  ]),
  operationalDefinition('PROMOTIONS', 'Promotion Report', [
    'employee_reports.view',
    'employee_movements:read',
  ]),
  operationalDefinition('RESIGNATIONS', 'Resignation Report', [
    'employee_reports.view',
    'offboarding:read',
  ]),
  operationalDefinition('EXITS', 'Exit Report', [
    'employee_reports.view',
    'offboarding:read',
  ]),
  operationalDefinition('EMPLOYEE_DOCUMENTS', 'Employee Document Report', [
    'employee_reports.view',
    'hr_documents:read',
  ]),
  operationalDefinition('LEAVE_BALANCE', 'Leave Balance Report', [
    'leave_reports.view',
    'leave-balances.view',
  ]),
  operationalDefinition(
    'LEAVE_PENDING_APPROVAL',
    'Leave Pending Approval Report',
    ['leave_reports.view', 'leave_requests:read'],
  ),
  operationalDefinition('PAYROLL_REGISTER', 'Payroll Register', [
    'payroll_reports.view',
    'payroll:reports',
  ]),
  operationalDefinition('BANK_TRANSFER', 'Bank Transfer Report', [
    'payroll_reports.view',
    'payroll:banking',
  ]),
  operationalDefinition('LOAN_OUTSTANDING', 'Loan Outstanding Report', [
    'loan_reports.view',
    'employee_finance:reports',
  ]),
  operationalDefinition(
    'FIELD_VISIT_MAP',
    'Map-Based Movement / Visit Report',
    ['field_reports.view', 'field_locations:read'],
  ),
  operationalDefinition('KPI_ASSIGNMENTS', 'Employee KPI Assignment Report', [
    'performance_reports.view',
    'performance_kpis:read',
  ]),
  operationalDefinition(
    'KPI_TARGET_VS_ACHIEVEMENT',
    'Monthly KPI Target vs Achievement',
    ['performance_reports.view', 'performance_kpis:read'],
  ),
  operationalDefinition('MONTHLY_KPI_SCORE', 'Monthly KPI Score', [
    'performance_reports.view',
    'performance_reports:read',
  ]),
  operationalDefinition('QUARTERLY_KPI_AVERAGE', 'Quarterly KPI Average', [
    'performance_reports.view',
    'performance_aggregates:read',
  ]),
  operationalDefinition('ANNUAL_KPI_AVERAGE', 'Annual KPI Average', [
    'performance_reports.view',
    'performance_aggregates:read',
  ]),
  operationalDefinition('KPI_SCORE_HISTORY', 'KPI Score History', [
    'performance_reports.view',
    'performance_reports:read',
  ]),
  operationalDefinition(
    'ATTENDANCE_EXCEPTIONS',
    'Attendance Exception Report',
    ['attendance_reports.view', 'attendance_summaries:read'],
  ),
  operationalDefinition(
    'ATTENDANCE_CORRECTIONS',
    'Attendance Correction Report',
    ['attendance_reports.view', 'attendance_summaries:read'],
  ),
];

@Injectable()
export class ReportRegistryService {
  private readonly definitions = new Map<string, RegisteredReportDefinition>(
    REGISTERED_REPORT_DEFINITIONS.map((definition) => [
      definition.reportCode,
      definition,
    ]),
  );

  constructor(
    private readonly attendanceSummaryReportRunner: AttendanceSummaryReportRunner,
    private readonly employeeMasterReportRunner: EmployeeMasterReportRunner,
    private readonly performanceSummaryReportRunner: PerformanceSummaryReportRunner,
    private readonly morningAttendanceReportRunner: MorningAttendanceReportRunner,
    private readonly endOfDayAttendanceReportRunner: EndOfDayAttendanceReportRunner,
    private readonly operationalAnalyticsReportRunner: OperationalAnalyticsReportRunner,
  ) {}

  private readonly runners = new Map<string, ReportRunner>();

  private ensureRunnersRegistered() {
    if (this.runners.size > 0) {
      return;
    }

    this.runners.set(
      this.attendanceSummaryReportRunner.reportCode,
      this.attendanceSummaryReportRunner,
    );
    this.runners.set(
      this.employeeMasterReportRunner.reportCode,
      this.employeeMasterReportRunner,
    );
    this.runners.set(
      this.performanceSummaryReportRunner.reportCode,
      this.performanceSummaryReportRunner,
    );
    this.runners.set(
      this.morningAttendanceReportRunner.reportCode,
      this.morningAttendanceReportRunner,
    );
    this.runners.set(
      this.endOfDayAttendanceReportRunner.reportCode,
      this.endOfDayAttendanceReportRunner,
    );
    for (const definition of REGISTERED_REPORT_DEFINITIONS) {
      if (definition.generatorService === 'OperationalAnalyticsReportRunner') {
        this.runners.set(
          definition.reportCode,
          this.operationalAnalyticsReportRunner,
        );
      }
    }
  }

  requireRunner(reportCode: string): ReportRunner {
    this.ensureRunnersRegistered();
    const runner = this.runners.get(reportCode.trim().toUpperCase());

    if (!runner) {
      throw new BadRequestException(
        `The selected report "${reportCode}" has no registered execution runner.`,
      );
    }

    return runner;
  }

  find(reportCode: string | null | undefined) {
    if (!reportCode?.trim()) {
      return null;
    }

    return this.definitions.get(reportCode.trim().toUpperCase()) ?? null;
  }

  listDefinitions() {
    return [...this.definitions.values()];
  }

  require(reportCode: string) {
    const definition = this.find(reportCode);

    if (!definition) {
      throw new BadRequestException(
        `The selected report "${reportCode}" is not registered or implemented and cannot be scheduled.`,
      );
    }

    return definition;
  }

  ensureFormatSupported(
    reportCode: string,
    outputFormat: ReportOutputFormatEnum | null | undefined,
  ) {
    if (!outputFormat) {
      return;
    }

    const definition = this.require(reportCode);
    if (!definition.supportedFormats.includes(outputFormat)) {
      throw new BadRequestException(
        `The selected report "${reportCode}" does not support output format "${outputFormat}".`,
      );
    }
  }

  ensureFiltersSupported(
    reportCode: string,
    reportFilters: Record<string, unknown> | null | undefined,
  ) {
    if (!reportFilters) {
      return;
    }

    const definition = this.require(reportCode);
    const unsupportedFilters = Object.keys(reportFilters).filter(
      (key) => !definition.supportedFilterFields.includes(key),
    );

    if (unsupportedFilters.length > 0) {
      throw new BadRequestException(
        `The selected report "${reportCode}" does not support these filters: ${unsupportedFilters.join(', ')}.`,
      );
    }
  }
}
