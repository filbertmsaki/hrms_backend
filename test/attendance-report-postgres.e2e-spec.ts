process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import './setup-e2e';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import { Company } from '../src/modules/companies/entities/company.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../src/modules/hr/employees/enums/employment-status.enum';
import { AttendanceDailySummary } from '../src/modules/hr/attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDailySummaryService } from '../src/modules/hr/attendance/processing/attendance-daily-summary.service';
import { QueryAttendanceDailySummariesDto } from '../src/modules/hr/attendance/processing/dtos/query-attendance-daily-summaries.dto';
import { EmployeePayrollCalculationService } from '../src/modules/hr/payroll/services/payroll-core.services';
import { PayrollOvertimeRequest } from '../src/modules/hr/payroll/entities/payroll-overtime-request.entity';
import { PayrollOvertimePolicy } from '../src/modules/hr/payroll/entities/payroll-configuration.entities';
import { AttendanceHoliday } from '../src/modules/hr/attendance/holidays/entities/holiday.entity';
import { AttendanceHolidayTypeEnum } from '../src/modules/hr/attendance/holidays/enums/attendance-holiday-type.enum';
import { HolidayGroup } from '../src/modules/hr/attendance/holidays/entities/holiday-group.entity';
import { AttendanceReportXlsxService } from '../src/modules/hr/attendance/processing/reports/attendance-report-xlsx.service';
import { AttendanceReportPdfService } from '../src/modules/hr/attendance/processing/reports/attendance-report-pdf.service';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

describe('Attendance report and payroll reconciliation (real Postgres)', () => {
  let dataSource: DataSource;
  let company: Company;
  let employee: Employee;
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  beforeAll(async () => {
    if (process.env.DB_NAME !== 'hrms_test_db') {
      throw new Error('This integration suite is restricted to hrms_test_db.');
    }
    dataSource = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    company = await dataSource.getRepository(Company).save(
      dataSource.getRepository(Company).create({
        name: `Attendance Report ${suffix}`,
        slug: `attendance-report-${suffix}`,
        status: 'active',
        metadata: { source: 'attendance-report-postgres-e2e' },
      }),
    );
    employee = await dataSource.getRepository(Employee).save(
      dataSource.getRepository(Employee).create({
        company_id: company.id,
        company_user_id: null,
        employee_no: `AR-${suffix}`.slice(0, 50),
        first_name: 'Synthetic',
        last_name: 'Employee',
        gender: 'male',
        employment_status: EmploymentStatusEnum.ACTIVE,
        hire_date: '2020-01-01',
      }),
    );

    const summaries = [
      { date: '2026-10-01', late: 12, early: 8, overtime: 90 },
      { date: '2026-10-03', late: 0, early: 4, overtime: 45 },
      { date: '2026-10-05', late: 6, early: 0, overtime: 30 },
    ];
    await dataSource.getRepository(AttendanceDailySummary).save(
      summaries.map((row) =>
        dataSource.getRepository(AttendanceDailySummary).create({
          companyId: company.id,
          branchId: null,
          employeeId: employee.id,
          attendanceDate: row.date,
          scheduleSource: 'POSTGRES_UAT_FIXTURE',
          shiftId: null,
          timetableId: null,
          timezone: 'Africa/Dar_es_Salaam',
          scheduleStartAt: null,
          scheduleEndAt: null,
          checkInAt: null,
          checkOutAt: null,
          lateMinutes: row.late,
          earlyDepartureMinutes: row.early,
          workMinutes: 480,
          breakMinutes: 0,
          overtimeMinutes: row.overtime,
          attendanceStatus: 'PRESENT',
          remarks: null,
          flags: { overtimeRequiresApproval: true },
          sourceFirstRawLogId: null,
          sourceLastRawLogId: null,
          calculationVersion: 1,
          isAdjusted: false,
          adjustedByCompanyUserId: null,
          adjustedAt: null,
          finalizedAt: new Date('2026-10-06T00:00:00Z'),
        }),
      ),
    );
    await dataSource.getRepository(PayrollOvertimeRequest).save([
      ...[
        ['2026-10-01', 80],
        ['2026-10-03', 30],
        ['2026-10-05', 15],
      ].map(([workDate, requestedMinutes]) =>
        dataSource.getRepository(PayrollOvertimeRequest).create({
          companyId: company.id,
          employeeId: employee.id,
          managerEmployeeId: null,
          workDate: String(workDate),
          requestedMinutes: Number(requestedMinutes),
          reason: 'Synthetic reconciliation fixture',
          status: 'APPROVED',
          managerComments: null,
          managerDecidedByCompanyUserId: null,
          managerDecidedAt: null,
          hrComments: null,
          hrDecidedByCompanyUserId: null,
          hrDecidedAt: null,
        }),
      ),
    ]);
    const holidayGroup = await dataSource.getRepository(HolidayGroup).save(
      dataSource.getRepository(HolidayGroup).create({
        companyId: company.id,
        name: `Attendance E2E ${suffix}`,
        description: null,
      }),
    );
    await dataSource.getRepository(AttendanceHoliday).save(
      dataSource.getRepository(AttendanceHoliday).create({
        companyId: company.id,
        holidayGroupId: holidayGroup.id,
        name: 'Synthetic holiday',
        date: '2026-10-05',
        isRecurring: false,
        type: AttendanceHolidayTypeEnum.PUBLIC,
        isPaid: true,
        affectsOvertime: true,
        countsAsWorkingDay: false,
        branchId: null,
      }),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized && company?.id) {
      await dataSource.query(
        'DELETE FROM payroll_overtime_requests WHERE company_id = $1',
        [company.id],
      );
      await dataSource.getRepository(Company).delete(company.id);
    }
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('filters persisted late/early/overtime rows and reconciles payroll buckets', async () => {
    const report = Object.create(
      AttendanceDailySummaryService.prototype,
    ) as AttendanceDailySummaryService;
    Object.assign(report, {
      dailySummaryRepository: dataSource.getRepository(AttendanceDailySummary),
      hrAccessService: {},
    });
    const collect = async (
      filters: Partial<QueryAttendanceDailySummariesDto>,
    ) => {
      const rows: Array<{
        lateMinutes: number;
        earlyDepartureMinutes: number;
        overtimeMinutes: number;
        approvedOvertimeMinutes: number;
        payableOvertimeMinutes: number;
      }> = [];
      const total = await report.streamReportRows(
        company.id,
        {
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          employee_id: employee.id,
          ...filters,
        },
        undefined,
        async (batch) => {
          rows.push(...batch);
        },
      );
      return { rows, total };
    };

    const all = await collect({});
    expect(all.total).toBe(3);
    expect(all.rows.reduce((sum, row) => sum + row.lateMinutes, 0)).toBe(18);
    expect(
      all.rows.reduce((sum, row) => sum + row.earlyDepartureMinutes, 0),
    ).toBe(12);
    expect(all.rows.reduce((sum, row) => sum + row.overtimeMinutes, 0)).toBe(
      165,
    );
    expect(
      all.rows.reduce((sum, row) => sum + row.approvedOvertimeMinutes, 0),
    ).toBe(125);
    expect(
      all.rows.reduce((sum, row) => sum + row.payableOvertimeMinutes, 0),
    ).toBe(125);
    expect((await collect({ late_only: true })).total).toBe(2);
    expect((await collect({ early_departure_only: true })).total).toBe(2);
    expect(
      (await collect({ late_only: true, early_departure_only: true })).total,
    ).toBe(1);
    expect((await collect({ overtime_only: true })).total).toBe(3);

    const payroll = Object.create(
      EmployeePayrollCalculationService.prototype,
    ) as EmployeePayrollCalculationService;
    Object.assign(payroll, {
      attendanceRepository: dataSource.getRepository(AttendanceDailySummary),
      overtimeRequestRepository: dataSource.getRepository(
        PayrollOvertimeRequest,
      ),
      overtimePolicyRepository: dataSource.getRepository(PayrollOvertimePolicy),
      holidayRepository: dataSource.getRepository(AttendanceHoliday),
    });
    const totals = await (
      payroll as unknown as {
        summarizeAttendance(
          companyId: number,
          employeeId: number,
          period: { startDate: string; endDate: string },
        ): Promise<{
          overtimeMinutes: number;
          payableOvertimeMinutes: number;
          pendingOvertimeApprovalMinutes: number;
          regularOvertimeMinutes: number;
          weekendOvertimeMinutes: number;
          holidayOvertimeMinutes: number;
        }>;
      }
    ).summarizeAttendance(company.id, employee.id, {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
    expect(totals).toMatchObject({
      overtimeMinutes: 165,
      payableOvertimeMinutes: 125,
      pendingOvertimeApprovalMinutes: 40,
      regularOvertimeMinutes: 80,
      weekendOvertimeMinutes: 30,
      holidayOvertimeMinutes: 15,
    });

    const reportContext = {
      companyName: 'Synthetic Attendance UAT',
      filename: 'synthetic-attendance.xlsx',
      reportingPeriodLabel: '2026-10-01 to 2026-10-31',
      generatedAt: new Date('2026-10-22T00:00:00Z'),
    };
    const readAll = async (
      write: (batch: typeof all.rows) => Promise<void>,
    ) => {
      await write(all.rows);
    };
    const xlsxStream = new PassThrough();
    const xlsxChunks: Buffer[] = [];
    xlsxStream.on('data', (chunk: Buffer) =>
      xlsxChunks.push(Buffer.from(chunk)),
    );
    Object.assign(xlsxStream, { status: jest.fn(), setHeader: jest.fn() });
    await new AttendanceReportXlsxService().export(
      xlsxStream as never,
      reportContext,
      readAll,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.concat(xlsxChunks));
    const totalsRow = workbook.getWorksheet('Attendance Report')!.getRow(5);
    expect(
      [9, 10, 11, 12, 13].map((column) => totalsRow.getCell(column).value),
    ).toEqual([18, 12, 165, 125, 125]);

    const pdfTextSpy = jest.spyOn(PDFDocument.prototype, 'text');
    const pdfStream = new PassThrough();
    const pdfChunks: Buffer[] = [];
    pdfStream.on('data', (chunk: Buffer) => pdfChunks.push(Buffer.from(chunk)));
    Object.assign(pdfStream, { status: jest.fn(), setHeader: jest.fn() });
    await new AttendanceReportPdfService().export(
      pdfStream as never,
      { ...reportContext, filename: 'synthetic-attendance.pdf' },
      readAll,
    );
    const pdfText = pdfTextSpy.mock.calls
      .map(([value]) => String(value))
      .join('|');
    expect(Buffer.concat(pdfChunks).subarray(0, 4).toString()).toBe('%PDF');
    expect(pdfText).toContain('TOTALS');
    for (const total of ['18', '12', '165', '125']) {
      expect(pdfText).toContain(total);
    }
    pdfTextSpy.mockRestore();
  });
});
