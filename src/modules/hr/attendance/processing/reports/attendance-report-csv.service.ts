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
        'Late Minutes',
        'Early Departure Minutes',
        'Calculated Overtime Minutes',
        'Approved Overtime Minutes',
        'Payable Overtime Minutes',
        'Overtime Approval Required',
        'Overtime Approval Status',
      ].join(',') + '\r\n',
    );

    const totals = {
      late: 0,
      early: 0,
      calculated: 0,
      approved: 0,
      payable: 0,
    };
    await readRows(async (rows) => {
      for (const row of rows) {
        totals.late += row.lateMinutes ?? 0;
        totals.early += row.earlyDepartureMinutes ?? 0;
        totals.calculated += row.overtimeMinutes ?? 0;
        totals.approved += row.approvedOvertimeMinutes ?? 0;
        totals.payable += row.payableOvertimeMinutes ?? 0;
        const line = [
          row.employeeName,
          row.employeeNumber,
          formatAttendanceDate(row.attendanceDate),
          row.shiftName,
          row.timetableName,
          row.attendanceStatus,
          formatAttendanceTime(row.checkInAt, row.timezone),
          formatAttendanceTime(row.checkOutAt, row.timezone),
          row.lateMinutes,
          row.earlyDepartureMinutes,
          row.overtimeMinutes,
          row.approvedOvertimeMinutes,
          row.payableOvertimeMinutes,
          row.overtimeApprovalRequired ? 'Yes' : 'No',
          row.overtimeApprovalStatus,
        ]
          .map((value) => escapeCsvCell(value))
          .join(',');

        await this.write(response, `${line}\r\n`);
      }
    });

    await this.write(
      response,
      [
        'TOTALS',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        totals.late,
        totals.early,
        totals.calculated,
        totals.approved,
        totals.payable,
        '',
        '',
      ]
        .map((value) => escapeCsvCell(value))
        .join(',') + '\r\n',
    );

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
