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
export class EndOfDayAttendanceReportRunner implements ReportRunner {
  readonly reportCode = 'END_OF_DAY_ATTENDANCE';

  constructor(
    private readonly attendanceReportSnapshotService: AttendanceReportSnapshotService,
    private readonly attendanceReportPreflightService: AttendanceReportPreflightService,
  ) {}

  async generate(context: ReportRunnerContext): Promise<ReportRunnerResult> {
    const reportDate = context.dateTo ?? context.dateFrom;

    if (!reportDate) {
      throw new Error('END_OF_DAY_ATTENDANCE requires a report date.');
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

  private missingCheckIn(snapshot: AttendanceDaySnapshot): number {
    return Math.max(
      0,
      snapshot.totals.expected -
        snapshot.totals.present -
        snapshot.totals.onLeave -
        snapshot.totals.absent,
    );
  }

  private totalExceptionsCount(snapshot: AttendanceDaySnapshot): number {
    return snapshot.rows.reduce((sum, row) => sum + row.exceptions.length, 0);
  }

  private formatWorkedHours(workMinutes: number): string {
    const hours = Math.floor(workMinutes / 60);
    const minutes = workMinutes % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}`;
  }

  private async buildXlsxBuffer(snapshot: AttendanceDaySnapshot) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('End of Day Attendance');

    worksheet.addRow(['End of Day Attendance Report']);
    worksheet.addRow(['Report Date', snapshot.reportDate]);
    worksheet.addRow([]);
    worksheet.addRow(['Expected', snapshot.totals.expected]);
    worksheet.addRow(['Present', snapshot.totals.present]);
    worksheet.addRow(['Absent', snapshot.totals.absent]);
    worksheet.addRow(['On Leave', snapshot.totals.onLeave]);
    worksheet.addRow(['Late', snapshot.totals.late]);
    worksheet.addRow(['Checked In', snapshot.totals.present]);
    worksheet.addRow(['Checked Out', snapshot.totals.checkedOut]);
    worksheet.addRow(['Missing Check-In', this.missingCheckIn(snapshot)]);
    worksheet.addRow(['Missing Check-Out', snapshot.totals.missingCheckOut]);
    worksheet.addRow(['Early Departure', snapshot.totals.earlyDeparture]);
    worksheet.addRow(['Exceptions', this.totalExceptionsCount(snapshot)]);
    worksheet.addRow([]);

    const headerRowIndex = worksheet.lastRow!.number + 1;
    worksheet.getRow(headerRowIndex).values = [
      'Employee Number',
      'Employee Name',
      'Department',
      'Branch',
      'Position',
      'Check-In Time',
      'Check-Out Time',
      'Worked Hours',
      'Attendance Status',
      'Exceptions',
    ];
    worksheet.getRow(headerRowIndex).font = { bold: true };

    worksheet.columns = [
      { key: 'employeeNumber', width: 18 },
      { key: 'employeeName', width: 28 },
      { key: 'departmentName', width: 22 },
      { key: 'branchName', width: 22 },
      { key: 'positionName', width: 22 },
      { key: 'checkInTime', width: 16 },
      { key: 'checkOutTime', width: 16 },
      { key: 'workedHours', width: 14 },
      { key: 'attendanceStatus', width: 18 },
      { key: 'exceptions', width: 30 },
    ];

    for (const row of snapshot.rows) {
      worksheet.addRow({
        employeeNumber: row.employeeNumber,
        employeeName: row.employeeName,
        departmentName: row.departmentName ?? '',
        branchName: row.branchName ?? '',
        positionName: row.positionName ?? '',
        checkInTime: formatAttendanceTime(row.checkInAt, row.timezone),
        checkOutTime: formatAttendanceTime(row.checkOutAt, row.timezone),
        workedHours: this.formatWorkedHours(row.workMinutes),
        attendanceStatus: row.attendanceStatus,
        exceptions: row.exceptions.join('; '),
      });
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private buildCsvBuffer(snapshot: AttendanceDaySnapshot) {
    const lines: string[] = [];
    lines.push(
      escapeCsvCell(`End of Day Attendance Report - ${snapshot.reportDate}`),
    );
    lines.push(
      [
        'Expected',
        'Present',
        'Absent',
        'On Leave',
        'Late',
        'Checked In',
        'Checked Out',
        'Missing Check-In',
        'Missing Check-Out',
        'Early Departure',
        'Exceptions',
      ].join(','),
    );
    lines.push(
      [
        snapshot.totals.expected,
        snapshot.totals.present,
        snapshot.totals.absent,
        snapshot.totals.onLeave,
        snapshot.totals.late,
        snapshot.totals.present,
        snapshot.totals.checkedOut,
        this.missingCheckIn(snapshot),
        snapshot.totals.missingCheckOut,
        snapshot.totals.earlyDeparture,
        this.totalExceptionsCount(snapshot),
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
        'Check-Out Time',
        'Worked Hours',
        'Attendance Status',
        'Exceptions',
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
          escapeCsvCell(formatAttendanceTime(row.checkOutAt, row.timezone)),
          escapeCsvCell(this.formatWorkedHours(row.workMinutes)),
          escapeCsvCell(row.attendanceStatus),
          escapeCsvCell(row.exceptions.join('; ')),
        ].join(','),
      );
    }

    return Buffer.from(lines.join('\r\n'), 'utf8');
  }
}
