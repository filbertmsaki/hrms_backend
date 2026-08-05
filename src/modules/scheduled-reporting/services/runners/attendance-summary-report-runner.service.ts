import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { AttendanceDailySummary } from '../../../hr/attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceReportRow } from '../../../hr/attendance/processing/reports/attendance-report.types';
import {
  buildEmployeeFullName,
  formatAttendanceTime,
  resolveReportLabel,
  toExcelDate,
  toExcelTime,
} from '../../../hr/attendance/processing/reports/attendance-report.utils';
import { ReportOutputFormatEnum } from '../../enums/report-output-format.enum';
import {
  ReportRunner,
  ReportRunnerContext,
  ReportRunnerResult,
} from '../../interfaces/report-runner.interface';

@Injectable()
export class AttendanceSummaryReportRunner implements ReportRunner {
  readonly reportCode = 'ATTENDANCE_SUMMARY';

  constructor(
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,
  ) {}

  async generate(context: ReportRunnerContext): Promise<ReportRunnerResult> {
    const dateFrom = context.dateFrom ?? context.dateTo;
    const dateTo = context.dateTo ?? context.dateFrom;

    if (!dateFrom || !dateTo) {
      throw new Error('ATTENDANCE_SUMMARY requires a date range.');
    }

    const rows = await this.fetchRows(context.companyId, dateFrom, dateTo);
    const outputFormat = context.outputFormat ?? ReportOutputFormatEnum.XLSX;
    const extension = outputFormat.toLowerCase();
    const filename = context.filenamePattern
      .replace(/\{\{\s*reportDate\s*\}\}/g, dateTo)
      .replace(/\.(xlsx|csv|pdf)$/i, `.${extension}`);

    if (outputFormat === ReportOutputFormatEnum.CSV) {
      return {
        filename,
        mimeType: 'text/csv',
        buffer: this.buildCsvBuffer(rows),
        recordCount: rows.length,
      };
    }

    return {
      filename,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await this.buildXlsxBuffer(rows),
      recordCount: rows.length,
    };
  }

  private async fetchRows(companyId: number, dateFrom: string, dateTo: string) {
    const rows = await this.attendanceDailySummaryRepository
      .createQueryBuilder('summary')
      .innerJoin('summary.employee', 'employee')
      .leftJoin('summary.shift', 'shift')
      .leftJoin('summary.timetable', 'timetable')
      .select('summary.id', 'summaryId')
      .addSelect('summary.attendance_date', 'attendanceDate')
      .addSelect('summary.attendance_status', 'attendanceStatus')
      .addSelect('summary.check_in_at', 'checkInAt')
      .addSelect('summary.check_out_at', 'checkOutAt')
      .addSelect('summary.timezone', 'timezone')
      .addSelect('employee.employee_no', 'employeeNumber')
      .addSelect('employee.first_name', 'employeeFirstName')
      .addSelect('employee.middle_name', 'employeeMiddleName')
      .addSelect('employee.last_name', 'employeeLastName')
      .addSelect('shift.name', 'shiftName')
      .addSelect('shift.code', 'shiftCode')
      .addSelect('timetable.name', 'timetableName')
      .addSelect('timetable.code', 'timetableCode')
      .where('summary.company_id = :companyId', { companyId })
      .andWhere('summary.attendance_date BETWEEN :dateFrom AND :dateTo', {
        dateFrom,
        dateTo,
      })
      .orderBy('summary.attendance_date', 'ASC')
      .addOrderBy('employee.employee_no', 'ASC')
      .getRawMany<{
        summaryId: number | string;
        attendanceDate: string;
        attendanceStatus: string;
        checkInAt: Date | null;
        checkOutAt: Date | null;
        timezone: string;
        employeeNumber: string;
        employeeFirstName: string;
        employeeMiddleName: string | null;
        employeeLastName: string;
        shiftName: string | null;
        shiftCode: string | null;
        timetableName: string | null;
        timetableCode: string | null;
      }>();

    return rows.map(
      (row): AttendanceReportRow => ({
        summaryId: Number(row.summaryId),
        employeeName:
          buildEmployeeFullName([
            row.employeeFirstName,
            row.employeeMiddleName,
            row.employeeLastName,
          ]) || row.employeeNumber,
        employeeNumber: row.employeeNumber,
        attendanceDate: row.attendanceDate,
        shiftName: resolveReportLabel(row.shiftName, row.shiftCode),
        timetableName: resolveReportLabel(row.timetableName, row.timetableCode),
        attendanceStatus: row.attendanceStatus,
        checkInAt: row.checkInAt ? new Date(row.checkInAt) : null,
        checkOutAt: row.checkOutAt ? new Date(row.checkOutAt) : null,
        timezone: row.timezone,
      }),
    );
  }

  private async buildXlsxBuffer(rows: AttendanceReportRow[]) {
    const workbook = new ExcelJS.Workbook();
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
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle' };

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
      });

      excelRow.getCell('attendanceDate').numFmt = 'yyyy-mm-dd';

      if (row.checkInAt) {
        excelRow.getCell('checkInTime').numFmt = 'hh:mm:ss';
      }

      if (row.checkOutAt) {
        excelRow.getCell('checkOutTime').numFmt = 'hh:mm:ss';
      }
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private buildCsvBuffer(rows: AttendanceReportRow[]) {
    const lines = [
      [
        'Employee Name',
        'Employee Number',
        'Attendance Date',
        'Shift',
        'Timetable',
        'Attendance Status',
        'Check-In Time',
        'Check-Out Time',
      ].join(','),
    ];

    for (const row of rows) {
      lines.push(
        [
          this.escapeCsvCell(row.employeeName),
          this.escapeCsvCell(row.employeeNumber),
          this.escapeCsvCell(row.attendanceDate),
          this.escapeCsvCell(row.shiftName),
          this.escapeCsvCell(row.timetableName),
          this.escapeCsvCell(row.attendanceStatus),
          this.escapeCsvCell(formatAttendanceTime(row.checkInAt, row.timezone)),
          this.escapeCsvCell(
            formatAttendanceTime(row.checkOutAt, row.timezone),
          ),
        ].join(','),
      );
    }

    return Buffer.from(lines.join('\r\n'), 'utf8');
  }

  private escapeCsvCell(value: string) {
    if (!/[",\r\n]/.test(value)) {
      return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
  }
}
