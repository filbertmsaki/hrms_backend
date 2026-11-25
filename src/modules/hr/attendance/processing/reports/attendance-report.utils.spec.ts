import { AttendanceReportFormatEnum } from '../dtos/attendance-report-format.enum';
import {
  buildAttendanceReportFilename,
  buildReportingPeriodLabel,
  escapeCsvCell,
  formatReportMinutes,
  normalizeAttendanceDate,
  toExcelDate,
} from './attendance-report.utils';

describe('attendance report utils', () => {
  it('normalizes attendance dates from strings and driver Date objects', () => {
    expect(normalizeAttendanceDate('2026-11-24')).toBe('2026-11-24');
    expect(normalizeAttendanceDate('2026-11-24T00:00:00.000Z')).toBe(
      '2026-11-24',
    );
    // node-postgres parses DATE as local midnight.
    expect(normalizeAttendanceDate(new Date(2026, 10, 24))).toBe('2026-11-24');
    expect(normalizeAttendanceDate(null)).toBe('');
  });

  it('builds Excel dates from either form and blanks invalid ones', () => {
    expect(toExcelDate(new Date(2026, 10, 24))?.toISOString()).toBe(
      '2026-11-24T00:00:00.000Z',
    );
    expect(toExcelDate('2026-11-24')?.toISOString()).toBe(
      '2026-11-24T00:00:00.000Z',
    );
    expect(toExcelDate('')).toBeNull();
  });

  it('leaves minutes blank when there is no value', () => {
    expect(formatReportMinutes(undefined)).toBe('');
    expect(formatReportMinutes(0)).toBe('0');
  });

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
