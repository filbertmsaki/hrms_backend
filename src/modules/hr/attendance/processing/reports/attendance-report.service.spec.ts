import { AttendanceDailySummaryService } from '../attendance-daily-summary.service';
import { DownloadAttendanceReportDto } from '../dtos/download-attendance-report.dto';
import { AttendanceReportFormatEnum } from '../dtos/attendance-report-format.enum';
import { AttendanceReportCsvService } from './attendance-report-csv.service';
import { AttendanceReportPdfService } from './attendance-report-pdf.service';
import { AttendanceReportService } from './attendance-report.service';
import { AttendanceReportXlsxService } from './attendance-report-xlsx.service';

describe('AttendanceReportService', () => {
  const dailySummaryService = {
    streamReportRows: jest.fn().mockResolvedValue(0),
  } as unknown as AttendanceDailySummaryService;
  const csvService = {
    export: jest.fn().mockResolvedValue(undefined),
  } as unknown as AttendanceReportCsvService;
  const pdfService = {
    export: jest.fn().mockResolvedValue(undefined),
  } as unknown as AttendanceReportPdfService;
  const xlsxService = {
    export: jest.fn().mockResolvedValue(undefined),
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

    expect((csvService.export as jest.Mock).mock.calls).toHaveLength(1);
    expect(pdfService.export).not.toHaveBeenCalled();
    expect(xlsxService.export).not.toHaveBeenCalled();

    const context = (csvService.export as jest.Mock).mock.calls[0][1];
    expect(context.filename).toBe('attendance-report-2026-07.csv');
    expect(context.companyName).toBe('OpenAI HR');
  });
});
