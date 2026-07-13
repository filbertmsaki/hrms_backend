import { AttendanceReportFormatEnum } from '../dtos/attendance-report-format.enum';
import {
  buildAttendanceReportFilename,
  buildReportingPeriodLabel,
  escapeCsvCell,
} from './attendance-report.utils';

describe('attendance report utils', () => {
  it('builds a monthly filename when the reporting period is within one month', () => {
    expect(
      buildAttendanceReportFilename(
        AttendanceReportFormatEnum.XLSX,
        '2026-07-01',
        '2026-07-31',
      ),
    ).toBe('attendance-report-2026-07.xlsx');
  });

  it('builds a range filename when the reporting period spans multiple months', () => {
    expect(
      buildAttendanceReportFilename(
        AttendanceReportFormatEnum.PDF,
        '2026-07-15',
        '2026-08-15',
      ),
    ).toBe('attendance-report-2026-07-15-to-2026-08-15.pdf');
  });

  it('escapes csv values with commas, quotes, and new lines', () => {
    expect(escapeCsvCell('Doe, "Jane"\nHQ')).toBe('"Doe, ""Jane""\nHQ"');
  });

  it('builds a readable period label', () => {
    expect(buildReportingPeriodLabel('2026-07-01', '2026-07-31')).toBe(
      '2026-07-01 to 2026-07-31',
    );
  });
});
