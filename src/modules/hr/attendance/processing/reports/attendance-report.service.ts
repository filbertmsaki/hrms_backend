import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedUser } from '../../../../../common/interfaces/authenticated-user.interface';
import { normalizeAttendanceSummaryQuery } from '../attendance-summary-query.util';
import { AttendanceDailySummaryService } from '../attendance-daily-summary.service';
import { DownloadAttendanceReportDto } from '../dtos/download-attendance-report.dto';
import { AttendanceReportFormatEnum } from '../dtos/attendance-report-format.enum';
import { AttendanceReportCsvService } from './attendance-report-csv.service';
import { AttendanceReportPdfService } from './attendance-report-pdf.service';
import { AttendanceReportXlsxService } from './attendance-report-xlsx.service';
import {
  AttendanceReportContext,
  AttendanceReportRow,
} from './attendance-report.types';
import {
  buildAttendanceReportFilename,
  buildReportingPeriodLabel,
} from './attendance-report.utils';

type AttendanceReportBatchReader = (
  writer: (rows: AttendanceReportRow[]) => Promise<void>,
) => Promise<void>;

@Injectable()
export class AttendanceReportService {
  constructor(
    private readonly dailySummaryService: AttendanceDailySummaryService,
    private readonly csvService: AttendanceReportCsvService,
    private readonly pdfService: AttendanceReportPdfService,
    private readonly xlsxService: AttendanceReportXlsxService,
  ) {}

  async downloadReport(
    response: Response,
    actor: AuthenticatedUser,
    query: DownloadAttendanceReportDto,
  ): Promise<void> {
    const normalizedQuery = normalizeAttendanceSummaryQuery(query);
    const context = this.buildContext(actor, query.format, normalizedQuery);
    const readRows: AttendanceReportBatchReader = async (writer) => {
      await this.dailySummaryService.streamReportRows(
        actor.companyId!,
        query,
        actor,
        writer,
      );
    };

    switch (query.format) {
      case AttendanceReportFormatEnum.CSV:
        await this.csvService.export(response, context, readRows);
        return;
      case AttendanceReportFormatEnum.PDF:
        await this.pdfService.export(response, context, readRows);
        return;
      case AttendanceReportFormatEnum.XLSX:
      default:
        await this.xlsxService.export(response, context, readRows);
    }
  }

  private buildContext(
    actor: AuthenticatedUser,
    format: AttendanceReportFormatEnum,
    query: ReturnType<typeof normalizeAttendanceSummaryQuery>,
  ): AttendanceReportContext {
    return {
      companyName: actor.companyName?.trim() || 'Company',
      filename: buildAttendanceReportFilename(
        format,
        query.fromDate,
        query.toDate,
      ),
      reportingPeriodLabel: buildReportingPeriodLabel(
        query.fromDate,
        query.toDate,
      ),
      generatedAt: new Date(),
    };
  }
}
