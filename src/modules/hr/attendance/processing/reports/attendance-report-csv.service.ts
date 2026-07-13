import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import {
  escapeCsvCell,
  formatAttendanceDate,
  formatAttendanceTime,
} from './attendance-report.utils';
import {
  AttendanceReportContext,
  AttendanceReportRow,
} from './attendance-report.types';

type AttendanceReportBatchReader = (
  writer: (rows: AttendanceReportRow[]) => Promise<void>,
) => Promise<void>;

@Injectable()
export class AttendanceReportCsvService {
  async export(
    response: Response,
    context: AttendanceReportContext,
    readRows: AttendanceReportBatchReader,
  ): Promise<void> {
    response.status(200);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${context.filename}"`,
    );
    response.setHeader('Cache-Control', 'no-store');

    await this.write(response, '\uFEFF');
    await this.write(
      response,
      [
        'Employee Name',
        'Employee Number',
        'Attendance Date',
        'Shift',
        'Timetable',
        'Attendance Status',
        'Check-In Time',
        'Check-Out Time',
      ].join(',') + '\r\n',
    );

    await readRows(async (rows) => {
      for (const row of rows) {
        const line = [
          row.employeeName,
          row.employeeNumber,
          formatAttendanceDate(row.attendanceDate),
          row.shiftName,
          row.timetableName,
          row.attendanceStatus,
          formatAttendanceTime(row.checkInAt, row.timezone),
          formatAttendanceTime(row.checkOutAt, row.timezone),
        ]
          .map((value) => escapeCsvCell(value))
          .join(',');

        await this.write(response, `${line}\r\n`);
      }
    });

    response.end();
  }

  private async write(response: Response, value: string): Promise<void> {
    if (response.write(value)) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      response.once('drain', resolve);
      response.once('error', reject);
    });
  }
}
