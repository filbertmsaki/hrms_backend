import { ReportOutputFormatEnum } from '../enums/report-output-format.enum';

export type ReportRunnerContext = {
  companyId: number;
  outputFormat: ReportOutputFormatEnum;
  filenamePattern: string;
  reportFilters: Record<string, unknown> | null;
  dateFrom: string | null;
  dateTo: string | null;
};

export type ReportRunnerResult = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  recordCount: number;
};

export interface ReportRunner {
  readonly reportCode: string;
  generate(context: ReportRunnerContext): Promise<ReportRunnerResult>;
}

export const REPORT_RUNNER = 'REPORT_RUNNER';
