import { BadRequestException, Injectable } from '@nestjs/common';
import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';

export type RegisteredReportDefinition = {
  reportCode: string;
  name: string;
  supportedFormats: ReportOutputFormatEnum[];
  supportedFilterFields: string[];
  requiredPermissions: string[];
  emailDeliverySupported: boolean;
  backgroundGenerationSupported: boolean;
};

@Injectable()
export class ReportRegistryService {
  private readonly definitions = new Map<string, RegisteredReportDefinition>([
    [
      'ATTENDANCE_SUMMARY',
      {
        reportCode: 'ATTENDANCE_SUMMARY',
        name: 'Attendance Summary',
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
      },
    ],
  ]);

  find(reportCode: string | null | undefined) {
    if (!reportCode?.trim()) {
      return null;
    }

    return this.definitions.get(reportCode.trim().toUpperCase()) ?? null;
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
