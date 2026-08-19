import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AttendanceReportPreflightService } from '../../../hr/attendance/processing/reports/attendance-report-preflight.service';
import { AttendanceReportSnapshotService } from '../../../hr/attendance/processing/reports/attendance-report-snapshot.service';
import { AttendanceDaySnapshot } from '../../../hr/attendance/processing/reports/attendance-report-snapshot.types';
import {
  escapeCsvCell,
  formatAttendanceTime,
} from '../../../hr/attendance/processing/reports/attendance-report.utils';
import { ReportOutputFormatEnum } from '../../enums/report-output-format.enum';
import {
  ReportRunner,
  ReportRunnerContext,
  ReportRunnerResult,
} from '../../interfaces/report-runner.interface';

@Injectable()
export class MorningAttendanceReportRunner implements ReportRunner {
  readonly reportCode = 'MORNING_ATTENDANCE';

  constructor(
    private readonly attendanceReportSnapshotService: AttendanceReportSnapshotService,
    private readonly attendanceReportPreflightService: AttendanceReportPreflightService,
  ) {}

  async generate(context: ReportRunnerContext): Promise<ReportRunnerResult> {
    const reportDate = context.dateTo ?? context.dateFrom;

    if (!reportDate) {
      throw new Error('MORNING_ATTENDANCE requires a report date.');
    }

    await this.attendanceReportPreflightService.ensureFullyProcessed(
      context.companyId,
      reportDate,
    );

    const branchId = this.readNumberFilter(context.reportFilters, 'branch_id');
    const departmentId = this.readNumberFilter(
      context.reportFilters,
      'department_id',
    );

    const snapshot = await this.attendanceReportSnapshotService.buildSnapshot(
      context.companyId,
      reportDate,
      { branchId, departmentId },
    );

    const outputFormat = context.outputFormat ?? ReportOutputFormatEnum.XLSX;
    const extension = outputFormat.toLowerCase();
    const filename = context.filenamePattern
      .replace(/\{\{\s*reportDate\s*\}\}/g, reportDate)
      .replace(/\.(xlsx|csv|pdf)$/i, `.${extension}`);

    if (outputFormat === ReportOutputFormatEnum.CSV) {
      return {
        filename,
        mimeType: 'text/csv',
        buffer: this.buildCsvBuffer(snapshot),
        recordCount: snapshot.rows.length,
      };
    }

    return {
      filename,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await this.buildXlsxBuffer(snapshot),
      recordCount: snapshot.rows.length,
    };
  }

  private readNumberFilter(
    filters: Record<string, unknown> | null,
    key: string,
  ): number | undefined {
    const value = filters?.[key];
    const parsed = value != null ? Number(value) : NaN;
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private async buildXlsxBuffer(snapshot: AttendanceDaySnapshot) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Morning Attendance');

    worksheet.addRow(['Morning Attendance Report']);
    worksheet.addRow(['Report Date', snapshot.reportDate]);
    worksheet.addRow([]);
    worksheet.addRow(['Expected', snapshot.totals.expected]);
    worksheet.addRow(['Present', snapshot.totals.present]);
    worksheet.addRow(['Absent', snapshot.totals.absent]);
    worksheet.addRow(['On Leave', snapshot.totals.onLeave]);
    worksheet.addRow(['Not Yet Checked In', snapshot.totals.notYetCheckedIn]);
    worksheet.addRow(['Late', snapshot.totals.late]);
    worksheet.addRow([]);

    const headerRowIndex = worksheet.lastRow!.number + 1;
    worksheet.getRow(headerRowIndex).values = [
      'Employee Number',
      'Employee Name',
      'Department',
      'Branch',
      'Position',
      'Check-In Time',
      'Attendance Status',
      'Leave Type/Reason',
    ];
    worksheet.getRow(headerRowIndex).font = { bold: true };

    worksheet.columns = [
      { key: 'employeeNumber', width: 18 },
      { key: 'employeeName', width: 28 },
      { key: 'departmentName', width: 22 },
      { key: 'branchName', width: 22 },
      { key: 'positionName', width: 22 },
      { key: 'checkInTime', width: 16 },
      { key: 'attendanceStatus', width: 18 },
      { key: 'leaveTypeLabel', width: 20 },
    ];

    for (const row of snapshot.rows) {
      worksheet.addRow({
        employeeNumber: row.employeeNumber,
        employeeName: row.employeeName,
        departmentName: row.departmentName ?? '',
        branchName: row.branchName ?? '',
        positionName: row.positionName ?? '',
        checkInTime: formatAttendanceTime(row.checkInAt, row.timezone),
        attendanceStatus: row.attendanceStatus,
        leaveTypeLabel: row.leaveTypeLabel ?? '',
      });
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private buildCsvBuffer(snapshot: AttendanceDaySnapshot) {
    const lines: string[] = [];
    lines.push(
      escapeCsvCell(`Morning Attendance Report - ${snapshot.reportDate}`),
    );
    lines.push(
      [
        'Expected',
        'Present',
        'Absent',
        'On Leave',
        'Not Yet Checked In',
        'Late',
      ].join(','),
    );
    lines.push(
      [
        snapshot.totals.expected,
        snapshot.totals.present,
        snapshot.totals.absent,
        snapshot.totals.onLeave,
        snapshot.totals.notYetCheckedIn,
        snapshot.totals.late,
      ].join(','),
    );
    lines.push('');
    lines.push(
      [
        'Employee Number',
        'Employee Name',
        'Department',
        'Branch',
        'Position',
        'Check-In Time',
        'Attendance Status',
        'Leave Type/Reason',
      ].join(','),
    );

    for (const row of snapshot.rows) {
      lines.push(
        [
          escapeCsvCell(row.employeeNumber),
          escapeCsvCell(row.employeeName),
          escapeCsvCell(row.departmentName ?? ''),
          escapeCsvCell(row.branchName ?? ''),
          escapeCsvCell(row.positionName ?? ''),
          escapeCsvCell(formatAttendanceTime(row.checkInAt, row.timezone)),
          escapeCsvCell(row.attendanceStatus),
          escapeCsvCell(row.leaveTypeLabel ?? ''),
        ].join(','),
      );
    }

    return Buffer.from(lines.join('\r\n'), 'utf8');
  }
}
