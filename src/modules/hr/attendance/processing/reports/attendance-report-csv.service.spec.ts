import { AttendanceReportCsvService } from './attendance-report-csv.service';
import {
  AttendanceReportContext,
  AttendanceReportRow,
} from './attendance-report.types';

describe('AttendanceReportCsvService reconciliation', () => {
  it('exports combined late/early cases and reconciled overtime totals across batches', async () => {
    const chunks: string[] = [];
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      write: jest.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
      end: jest.fn(),
    } as never;
    const rows: AttendanceReportRow[] = [
      {
        summaryId: 1,
        employeeName: 'A One',
        employeeNumber: 'E1',
        attendanceDate: '2026-10-01',
        shiftName: 'Day',
        timetableName: 'Default',
        attendanceStatus: 'PRESENT',
        checkInAt: null,
        checkOutAt: null,
        timezone: 'Africa/Dar_es_Salaam',
        lateMinutes: 12,
        earlyDepartureMinutes: 8,
        overtimeMinutes: 90,
        approvedOvertimeMinutes: 60,
        payableOvertimeMinutes: 60,
        overtimeApprovalRequired: true,
        overtimeApprovalStatus: 'APPROVED',
      },
      {
        summaryId: 2,
        employeeName: 'B Two',
        employeeNumber: 'E2',
        attendanceDate: '2026-10-01',
        shiftName: 'Day',
        timetableName: 'Default',
        attendanceStatus: 'PRESENT',
        checkInAt: null,
        checkOutAt: null,
        timezone: 'Africa/Dar_es_Salaam',
        lateMinutes: 0,
        earlyDepartureMinutes: 4,
        overtimeMinutes: 0,
        approvedOvertimeMinutes: 0,
        payableOvertimeMinutes: 0,
        overtimeApprovalRequired: true,
        overtimeApprovalStatus: 'PENDING',
      },
    ];
    const readRows = async (
      write: (batch: AttendanceReportRow[]) => Promise<void>,
    ) => {
      await write(rows.slice(0, 1));
      await write(rows.slice(1));
    };
    const context: AttendanceReportContext = {
      companyName: 'Example Co',
      filename: 'attendance.csv',
      reportingPeriodLabel: '2026-10',
      generatedAt: new Date('2026-10-22T00:00:00Z'),
    };

    await new AttendanceReportCsvService().export(response, context, readRows);

    const csv = chunks.join('');
    expect(csv).toContain('12,8,90,60,60');
    expect(csv).toContain('TOTALS,,,,,,,,12,12,90,60,60');
    expect(response.end).toHaveBeenCalledTimes(1);
  });
});
