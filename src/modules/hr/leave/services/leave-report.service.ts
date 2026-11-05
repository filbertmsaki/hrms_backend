import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { calculateAvailableLeaveDays } from '../utils/leave-balance-rules.util';

export type LeaveReportType =
  | 'balances'
  | 'taken'
  | 'pending'
  | 'by-department';
export type LeaveReportFormat = 'xlsx' | 'csv';

export type LeaveReportQuery = {
  fiscal_year?: string;
  from_date?: string;
  to_date?: string;
  department_id?: number;
  leave_type_id?: number;
};

type Column = { header: string; key: string; width: number };
type ReportData = {
  title: string;
  columns: Column[];
  rows: Record<string, unknown>[];
};

const PENDING = [
  LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
  LeaveStatusEnum.PENDING_HR,
  LeaveStatusEnum.IN_REVIEW,
];

const STATUS_LABELS: Record<string, string> = {
  pending_department_manager: 'Pending manager',
  pending_hr: 'Pending HR',
  in_review: 'Pending management',
};

const MAX_ROWS = 50_000;

/** Server-side leave reports, scoped to what the actor may see. */
@Injectable()
export class LeaveReportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hrAccessService: HrAccessService,
  ) {}

  async build(
    companyId: number,
    type: LeaveReportType,
    query: LeaveReportQuery,
    actor: AuthenticatedUser,
  ): Promise<ReportData> {
    const year = /^\d{4}$/.test(query.fiscal_year ?? '')
      ? query.fiscal_year!
      : new Date().toISOString().slice(0, 4);
    const from = query.from_date?.slice(0, 10) ?? `${year}-01-01`;
    const to = query.to_date?.slice(0, 10) ?? `${year}-12-31`;
    if (from > to) throw new BadRequestException('from_date is after to_date');
    const allowed = await this.hrAccessService.getAccessibleEmployeeIds(actor);

    if (type === 'balances') {
      return this.balances(companyId, year, query, allowed);
    }
    if (type === 'by-department') {
      return this.byDepartment(companyId, from, to, query, allowed);
    }
    return this.requests(companyId, type, from, to, query, allowed);
  }

  /** Writes the report as an Excel or CSV download. */
  async send(
    response: Response,
    report: ReportData,
    format: LeaveReportFormat,
    filenameBase: string,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    if (format === 'csv') {
      const escape = (value: unknown) => {
        const text =
          value === null || value === undefined
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value as string | number | boolean);
        // Neutralise spreadsheet formula injection.
        const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
        return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
      };
      const lines = [
        report.columns.map((column) => escape(column.header)).join(','),
        ...report.rows.map((row) =>
          report.columns.map((column) => escape(row[column.key])).join(','),
        ),
      ];
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${filenameBase}.csv"`,
      );
      response.status(200).send(`\uFEFF${lines.join('\r\n')}`);
      return;
    }

    response.status(200);
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filenameBase}.xlsx"`,
    );
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: response,
      useStyles: true,
      useSharedStrings: false,
    });
    const sheet = workbook.addWorksheet(report.title.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = report.columns;
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).commit();
    for (const row of report.rows) sheet.addRow(row).commit();
    sheet.commit();
    await workbook.commit();
  }

  private scope<T extends object>(
    qb: SelectQueryBuilder<T>,
    employeeAlias: string,
    query: LeaveReportQuery,
    allowed: number[] | null,
  ) {
    if (allowed !== null) {
      qb.andWhere(`${employeeAlias}.id IN (:...allowedIds)`, {
        allowedIds: allowed.length ? allowed : [0],
      });
    }
    if (query.department_id) {
      qb.andWhere(`${employeeAlias}.primary_department_id = :departmentId`, {
        departmentId: query.department_id,
      });
    }
    return qb;
  }

  private async balances(
    companyId: number,
    year: string,
    query: LeaveReportQuery,
    allowed: number[] | null,
  ): Promise<ReportData> {
    const qb = this.dataSource
      .getRepository(LeaveBalance)
      .createQueryBuilder('balance')
      .innerJoinAndSelect('balance.employee', 'employee')
      .leftJoinAndSelect('employee.primary_department', 'department')
      .innerJoinAndSelect('balance.leave_type', 'leaveType')
      .where('balance.company_id = :companyId', { companyId })
      .andWhere('balance.fiscal_year = :year', { year });
    if (query.leave_type_id) {
      qb.andWhere('balance.leave_type_id = :leaveTypeId', {
        leaveTypeId: query.leave_type_id,
      });
    }
    const rows = await this.scope(qb, 'employee', query, allowed)
      .orderBy('employee.first_name', 'ASC')
      .take(MAX_ROWS)
      .getMany();
    const n = (value: string | null | undefined) => Number(value ?? 0);
    return {
      title: `Leave balances ${year}`,
      columns: [
        { header: 'Employee No', key: 'employee_no', width: 14 },
        { header: 'Employee', key: 'employee', width: 28 },
        { header: 'Department', key: 'department', width: 22 },
        { header: 'Leave Type', key: 'leave_type', width: 20 },
        { header: 'Entitlement', key: 'entitlement', width: 12 },
        { header: 'Accrued', key: 'accrued', width: 10 },
        { header: 'Carried Forward', key: 'carried', width: 15 },
        { header: 'Adjusted', key: 'adjusted', width: 10 },
        { header: 'Used', key: 'used', width: 8 },
        { header: 'Pending', key: 'pending', width: 9 },
        { header: 'Expired', key: 'expired', width: 9 },
        { header: 'Available', key: 'available', width: 10 },
      ],
      rows: rows.map((balance) => ({
        employee_no: balance.employee.employee_no,
        employee: `${balance.employee.first_name} ${balance.employee.last_name}`,
        department: balance.employee.primary_department?.name ?? '',
        leave_type: balance.leave_type.name,
        entitlement: n(balance.entitlement_days),
        accrued: n(balance.accrued_days),
        carried: n(
          balance.opening_balance_days || balance.carried_forward_days,
        ),
        adjusted: n(balance.adjusted_days),
        used: n(balance.used_days),
        pending: n(balance.pending_days),
        expired: n(balance.expired_days),
        available: Math.round(calculateAvailableLeaveDays(balance) * 100) / 100,
      })),
    };
  }

  private async requests(
    companyId: number,
    type: 'taken' | 'pending',
    from: string,
    to: string,
    query: LeaveReportQuery,
    allowed: number[] | null,
  ): Promise<ReportData> {
    const qb = this.dataSource
      .getRepository(LeaveRequest)
      .createQueryBuilder('request')
      .innerJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('employee.primary_department', 'department')
      .innerJoinAndSelect('request.leave_type', 'leaveType')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.start_date <= :to', { to })
      .andWhere('request.end_date >= :from', { from })
      .andWhere('request.status IN (:...statuses)', {
        statuses: type === 'taken' ? [LeaveStatusEnum.APPROVED] : PENDING,
      });
    if (query.leave_type_id) {
      qb.andWhere('request.leave_type_id = :leaveTypeId', {
        leaveTypeId: query.leave_type_id,
      });
    }
    const rows = await this.scope(qb, 'employee', query, allowed)
      .orderBy('request.start_date', 'ASC')
      .take(MAX_ROWS)
      .getMany();
    const now = Date.now();
    return {
      title: type === 'taken' ? 'Leave taken' : 'Pending leave approvals',
      columns: [
        { header: 'Leave No', key: 'leave_no', width: 16 },
        { header: 'Employee No', key: 'employee_no', width: 14 },
        { header: 'Employee', key: 'employee', width: 28 },
        { header: 'Department', key: 'department', width: 22 },
        { header: 'Leave Type', key: 'leave_type', width: 20 },
        { header: 'Start', key: 'start_date', width: 12 },
        { header: 'End', key: 'end_date', width: 12 },
        { header: 'Days', key: 'days', width: 8 },
        ...(type === 'pending'
          ? [
              { header: 'Stage', key: 'stage', width: 18 },
              { header: 'Days Waiting', key: 'waiting', width: 13 },
            ]
          : [{ header: 'Approved On', key: 'approved_at', width: 14 }]),
      ],
      rows: rows.map((request) => ({
        leave_no: request.leave_no,
        employee_no: request.employee.employee_no,
        employee: `${request.employee.first_name} ${request.employee.last_name}`,
        department: request.employee.primary_department?.name ?? '',
        leave_type: request.leave_type.name,
        start_date: request.start_date,
        end_date: request.end_date,
        days: Number(request.total_days),
        stage: STATUS_LABELS[request.status] ?? request.status,
        waiting: Math.floor(
          (now -
            new Date(
              request.stage_entered_at ?? request.applied_at ?? now,
            ).getTime()) /
            86_400_000,
        ),
        approved_at: request.approved_at
          ? request.approved_at.toISOString().slice(0, 10)
          : '',
      })),
    };
  }

  private async byDepartment(
    companyId: number,
    from: string,
    to: string,
    query: LeaveReportQuery,
    allowed: number[] | null,
  ): Promise<ReportData> {
    const qb = this.dataSource
      .getRepository(LeaveRequest)
      .createQueryBuilder('request')
      .innerJoin('request.employee', 'employee')
      .leftJoin('employee.primary_department', 'department')
      .innerJoin('request.leave_type', 'leaveType')
      .select("COALESCE(department.name, 'No department')", 'department')
      .addSelect('leaveType.name', 'leave_type')
      .addSelect('COUNT(DISTINCT request.employee_id)', 'employees')
      .addSelect(
        `SUM(CASE WHEN request.status = :approved THEN 1 ELSE 0 END)`,
        'approved_requests',
      )
      .addSelect(
        `SUM(CASE WHEN request.status = :approved THEN request.total_days ELSE 0 END)`,
        'approved_days',
      )
      .addSelect(
        `SUM(CASE WHEN request.status IN (:...pending) THEN 1 ELSE 0 END)`,
        'pending_requests',
      )
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.start_date <= :to', { to })
      .andWhere('request.end_date >= :from', { from })
      .setParameters({ approved: LeaveStatusEnum.APPROVED, pending: PENDING })
      .groupBy('department.name')
      .addGroupBy('leaveType.name')
      .orderBy('department', 'ASC');
    if (query.leave_type_id) {
      qb.andWhere('request.leave_type_id = :leaveTypeId', {
        leaveTypeId: query.leave_type_id,
      });
    }
    const rows = await this.scope(qb, 'employee', query, allowed).getRawMany<
      Record<string, string>
    >();
    return {
      title: 'Leave by department',
      columns: [
        { header: 'Department', key: 'department', width: 26 },
        { header: 'Leave Type', key: 'leave_type', width: 22 },
        { header: 'Employees', key: 'employees', width: 11 },
        { header: 'Approved Requests', key: 'approved_requests', width: 17 },
        { header: 'Approved Days', key: 'approved_days', width: 14 },
        { header: 'Pending Requests', key: 'pending_requests', width: 16 },
      ],
      rows: rows.map((row) => ({
        department: row.department,
        leave_type: row.leave_type,
        employees: Number(row.employees),
        approved_requests: Number(row.approved_requests),
        approved_days: Number(row.approved_days),
        pending_requests: Number(row.pending_requests),
      })),
    };
  }
}
