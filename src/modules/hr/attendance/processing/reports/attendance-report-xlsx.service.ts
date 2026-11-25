import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import {
  formatAttendanceTime,
  toExcelDate,
  toExcelTime,
} from './attendance-report.utils';
import {
  AttendanceReportContext,
  AttendanceReportRow,
} from './attendance-report.types';

type AttendanceReportBatchReader = (
  writer: (rows: AttendanceReportRow[]) => Promise<void>,
) => Promise<void>;

@Injectable()
export class AttendanceReportXlsxService {
  async export(
    response: Response,
    context: AttendanceReportContext,
    readRows: AttendanceReportBatchReader,
  ): Promise<void> {
    response.status(200);
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${context.filename}"`,
    );
    response.setHeader('Cache-Control', 'no-store');

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: response,
      useStyles: true,
      useSharedStrings: false,
    });
    const worksheet = workbook.addWorksheet('Attendance Report', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    worksheet.columns = [
      { header: 'Employee Name', key: 'employeeName', width: 28 },
      { header: 'Employee Number', key: 'employeeNumber', width: 18 },
      { header: 'Attendance Date', key: 'attendanceDate', width: 16 },
      { header: 'Shift', key: 'shiftName', width: 24 },
      { header: 'Timetable', key: 'timetableName', width: 24 },
      { header: 'Attendance Status', key: 'attendanceStatus', width: 18 },
      { header: 'Check-In Time', key: 'checkInTime', width: 16 },
      { header: 'Check-Out Time', key: 'checkOutTime', width: 16 },
      { header: 'Late Minutes', key: 'lateMinutes', width: 14 },
      {
        header: 'Early Departure Minutes',
        key: 'earlyDepartureMinutes',
        width: 23,
      },
      {
        header: 'Calculated Overtime Minutes',
        key: 'overtimeMinutes',
        width: 25,
      },
      {
        header: 'Approved Overtime Minutes',
        key: 'approvedOvertimeMinutes',
        width: 24,
      },
      {
        header: 'Payable Overtime Minutes',
        key: 'payableOvertimeMinutes',
        width: 23,
      },
      {
        header: 'Overtime Approval Required',
        key: 'overtimeApprovalRequired',
        width: 24,
      },
      {
        header: 'Overtime Approval Status',
        key: 'overtimeApprovalStatus',
        width: 23,
      },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.commit();

    await readRows((rows) => {
      for (const row of rows) {
        const excelRow = worksheet.addRow({
          employeeName: row.employeeName,
          employeeNumber: row.employeeNumber,
          attendanceDate: toExcelDate(row.attendanceDate),
          shiftName: row.shiftName,
          timetableName: row.timetableName,
          attendanceStatus: row.attendanceStatus,
          checkInTime:
            toExcelTime(row.checkInAt, row.timezone) ??
            formatAttendanceTime(row.checkInAt, row.timezone),
          checkOutTime:
            toExcelTime(row.checkOutAt, row.timezone) ??
            formatAttendanceTime(row.checkOutAt, row.timezone),
          lateMinutes: row.lateMinutes,
          earlyDepartureMinutes: row.earlyDepartureMinutes,
          overtimeMinutes: row.overtimeMinutes,
          approvedOvertimeMinutes: row.approvedOvertimeMinutes,
          payableOvertimeMinutes: row.payableOvertimeMinutes,
          overtimeApprovalRequired: row.overtimeApprovalRequired ? 'Yes' : 'No',
          overtimeApprovalStatus: row.overtimeApprovalStatus,
        });

        excelRow.getCell('attendanceDate').numFmt = 'yyyy-mm-dd';

        if (row.checkInAt) {
          excelRow.getCell('checkInTime').numFmt = 'hh:mm:ss';
        }

        if (row.checkOutAt) {
          excelRow.getCell('checkOutTime').numFmt = 'hh:mm:ss';
        }

        excelRow.commit();
      }

      return Promise.resolve();
    });

    worksheet.commit();
    await workbook.commit();
  }
}
