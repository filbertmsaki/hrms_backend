import { Injectable } from '@nestjs/common';
import { AnalyticsOperationalReportQueryDto } from '../../../analytics/dto/analytics.dto';
import { AnalyticsOperationalReportService } from '../../../analytics/services/analytics-core.services';
import {
  ReportRunner,
  ReportRunnerContext,
  ReportRunnerResult,
} from '../../interfaces/report-runner.interface';

@Injectable()
export class OperationalAnalyticsReportRunner implements ReportRunner {
  readonly reportCode = 'OPERATIONAL_ANALYTICS';

  constructor(
    private readonly operationalReportService: AnalyticsOperationalReportService,
  ) {}

  async generate(context: ReportRunnerContext): Promise<ReportRunnerResult> {
    const query = {
      ...(context.reportFilters ?? {}),
      date_from: context.dateFrom ?? undefined,
      date_to: context.dateTo ?? undefined,
      output_format: context.outputFormat,
      limit: 50000,
    } as AnalyticsOperationalReportQueryDto;
    const result = await this.operationalReportService.exportForCompany(
      context.companyId,
      context.reportCode,
      query,
    );

    return {
      ...result,
      filename: this.filename(context, result.filename),
    };
  }

  private filename(context: ReportRunnerContext, fallback: string) {
    const extension = fallback.split('.').pop() ?? 'xlsx';
    const reportDate = context.dateTo ?? context.dateFrom ?? 'export';
    const requested = context.filenamePattern
      .replace(/\{\{\s*reportDate\s*\}\}/g, reportDate)
      .replace(/\{\{\s*reportCode\s*\}\}/g, context.reportCode);
    return /\.[a-z0-9]+$/i.test(requested)
      ? requested.replace(/\.[a-z0-9]+$/i, `.${extension}`)
      : `${requested}.${extension}`;
  }
}
