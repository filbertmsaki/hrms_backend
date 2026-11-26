import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { AttendanceReportPdfService } from './attendance-report-pdf.service';

describe('AttendanceReportPdfService', () => {
  it('renders each attendance dimension in its own column', async () => {
    const spy = jest.spyOn(PDFDocument.prototype, 'text');
    const stream = new PassThrough();
    stream.resume();
    Object.assign(stream, { status: jest.fn(), setHeader: jest.fn() });
    try {
      await new AttendanceReportPdfService().export(
        stream as never,
        {
          companyName: 'Example',
          filename: 'report.pdf',
          reportingPeriodLabel: '2026-10',
          generatedAt: new Date('2026-10-22T00:00:00Z'),
        },
        async (write) =>
          write([
            {
              summaryId: 1,
              employeeName: 'Example Employee',
              employeeNumber: 'E1',
              attendanceDate: '2026-10-01',
              shiftName: 'Day',
              timetableName: 'Default',
              attendanceStatus: 'PRESENT',
              primaryStatusLabel: 'Present',
              punchStatusLabel: 'Missing Check-Out',
              arrivalStatusLabel: 'Late Arrival',
              departureStatusLabel: 'Unknown',
              checkInAt: null,
              checkOutAt: null,
              timezone: 'Africa/Dar_es_Salaam',
            },
          ]),
      );
      const calls = spy.mock.calls;
      const headerOrder = [
        'Attendance Date',
        'Check-In',
        'Check-Out',
        'Shift',
      ].map((value) => calls.findIndex(([text]) => text === value));
      expect(headerOrder.every((index) => index >= 0)).toBe(true);
      expect(headerOrder).toEqual([...headerOrder].sort((a, b) => a - b));
      for (const value of [
        'Attendance Status',
        'Record Completeness',
        'Arrival Status',
        'Departure Status',
        'Present',
        'Missing Check-Out',
        'Late Arrival',
        'Unknown',
      ]) {
        expect(calls.some(([text]) => text === value)).toBe(true);
      }
      const positions = [
        'Present',
        'Missing Check-Out',
        'Late Arrival',
        'Unknown',
      ].map((value) => calls.find(([text]) => text === value)?.[1]);
      expect(positions.every((position) => typeof position === 'number')).toBe(
        true,
      );
      expect(new Set(positions).size).toBe(4);
    } finally {
      spy.mockRestore();
    }
  });
});
