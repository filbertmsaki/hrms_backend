import { AttendanceDailySummaryService } from '../attendance-daily-summary.service';
import { DownloadAttendanceReportDto } from '../dtos/download-attendance-report.dto';
import { AttendanceReportFormatEnum } from '../dtos/attendance-report-format.enum';
import { AttendanceReportCsvService } from './attendance-report-csv.service';
import { AttendanceReportPdfService } from './attendance-report-pdf.service';
import { AttendanceReportService } from './attendance-report.service';
import { AttendanceReportXlsxService } from './attendance-report-xlsx.service';

describe('AttendanceReportService', () => {
  const streamReportRowsMock = jest.fn().mockResolvedValue(0);
  const csvExportMock = jest
    .fn<Promise<void>, [unknown, { filename: string; companyName: string }]>()
    .mockResolvedValue(undefined);
  const pdfExportMock = jest.fn().mockResolvedValue(undefined);
  const xlsxExportMock = jest.fn().mockResolvedValue(undefined);

  const dailySummaryService = {
    streamReportRows: streamReportRowsMock,
  } as unknown as AttendanceDailySummaryService;
  const csvService = {
    export: csvExportMock,
  } as unknown as AttendanceReportCsvService;
  const pdfService = {
    export: pdfExportMock,
  } as unknown as AttendanceReportPdfService;
  const xlsxService = {
    export: xlsxExportMock,
  } as unknown as AttendanceReportXlsxService;

  const service = new AttendanceReportService(
    dailySummaryService,
    csvService,
    pdfService,
    xlsxService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes csv downloads to the csv exporter', async () => {
    const response = {} as never;
    const actor = {
      companyId: 10,
      companyName: 'OpenAI HR',
    } as never;
    const query: DownloadAttendanceReportDto = {
      format: AttendanceReportFormatEnum.CSV,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    };

    await service.downloadReport(response, actor, query);

    expect(csvExportMock.mock.calls).toHaveLength(1);
    expect(pdfExportMock).not.toHaveBeenCalled();
    expect(xlsxExportMock).not.toHaveBeenCalled();

    const context = csvExportMock.mock.calls[0][1] as {
      filename: string;
      companyName: string;
    };
    expect(context.filename).toBe('attendance-report-2026-07.csv');
    expect(context.companyName).toBe('OpenAI HR');
  });
});
