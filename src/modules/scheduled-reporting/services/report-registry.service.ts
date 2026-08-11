import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';
import { ReportRunner } from '../interfaces/report-runner.interface';
import { AttendanceSummaryReportRunner } from './runners/attendance-summary-report-runner.service';
import { EmployeeMasterReportRunner } from './runners/employee-master-report-runner.service';
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
