import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeDepartmentAssignmentHistory } from '../../employees/entities/employee-department-assignment-history.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  DailyActivityEntry,
  DailyActivityReport,
} from '../entities/daily-activity.entities';
import { DailyActivityStatusEnum } from '../enums/work-activity.enums';
import { WorkActivityQueryDto } from '../dto/queries.dto';

const PLANNED_STATUSES = new Set<DailyActivityStatusEnum>([
  DailyActivityStatusEnum.PLANNED,
  DailyActivityStatusEnum.IN_PROGRESS,
  DailyActivityStatusEnum.COMPLETED,
  DailyActivityStatusEnum.DEFERRED,
]);
const TERMINAL_STATUSES = new Set<DailyActivityStatusEnum>([
  DailyActivityStatusEnum.COMPLETED,
  DailyActivityStatusEnum.DEFERRED,
  DailyActivityStatusEnum.CANCELLED,
]);

type ActivityReportRow = Record<string, unknown> & {
  entry_id: number;
  employee_id: number;
  activity_date: string;
  status: DailyActivityStatusEnum;
  planned: boolean;
  completed: boolean;
  overdue: boolean;
};

/** Planned/completed period reporting uses the original daily report date. */
@Injectable()
export class PlannedCompletedActivityReportService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(DailyActivityReport)
    private readonly reportRepository: Repository<DailyActivityReport>,
    @InjectRepository(DailyActivityEntry)
    private readonly entryRepository: Repository<DailyActivityEntry>,
    @InjectRepository(EmployeeDepartmentAssignmentHistory)
    private readonly departmentHistoryRepository: Repository<EmployeeDepartmentAssignmentHistory>,
  ) {}

  async getReport(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const rows = await this.getFilteredRows(actor, query);
    const total = this.summarize(rows);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const start = (page - 1) * limit;
    return {
      data: rows.slice(start, start + limit),
      meta: {
        page,
        limit,
        total: rows.length,
        total_pages: Math.ceil(rows.length / limit),
      },
      totals: total,
      daily: this.groupByActivityDate(rows),
    };
  }

  async exportReport(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const rows = await this.getFilteredRows(actor, query);
    return [
      ...rows.map((row) => ({ row_type: 'ACTIVITY', ...row })),
      { row_type: 'TOTAL', ...this.summarize(rows) },
    ];
  }

  private summarize(rows: ActivityReportRow[]) {
    const planned = rows.filter((row) => row.planned);
    const completed = planned.filter((row) => row.completed);
    const deferred = rows.filter(
      (row) => row.status === DailyActivityStatusEnum.DEFERRED,
    );
    const cancelled = rows.filter(
      (row) => row.status === DailyActivityStatusEnum.CANCELLED,
    );
    const overdue = planned.filter((row) => row.overdue);
    const completedLate = planned.filter((row) => row.completed_late === true);
    return {
      planned_count: planned.length,
      completed_count: completed.length,
      incomplete_count: planned.length - completed.length,
      deferred_count: deferred.length,
      cancelled_count: cancelled.length,
      overdue_count: overdue.length,
      completed_late_count: completedLate.length,
      completion_percent: planned.length
        ? Number(((completed.length / planned.length) * 100).toFixed(2))
        : 0,
    };
  }

  private groupByActivityDate(rows: ActivityReportRow[]) {
    const groups = new Map<string, ActivityReportRow[]>();
    for (const row of rows) {
      const group = groups.get(row.activity_date) ?? [];
      group.push(row);
      groups.set(row.activity_date, group);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([activityDate, items]) => ({
        activity_date: activityDate,
        ...this.summarize(items),
      }));
  }

  private async getFilteredRows(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
  ): Promise<ActivityReportRow[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const today = new Date().toISOString().slice(0, 10);
    const dateFrom =
      query.date_from ?? query.date_to ?? `${today.slice(0, 7)}-01`;
    const dateTo = query.date_to ?? query.date_from ?? today;
    this.assertDateRange(dateFrom, dateTo);
    const accessibleIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (accessibleIds?.length === 0) return [];
    const reportQb = this.reportRepository
      .createQueryBuilder('report')
      .where('report.companyId = :companyId', { companyId })
      .andWhere('report.activityDate >= :dateFrom', { dateFrom })
      .andWhere('report.activityDate <= :dateTo', { dateTo })
      .andWhere('report.status != :cancelledReport', {
        cancelledReport: 'CANCELLED',
      });
    if (accessibleIds) {
      reportQb.andWhere('report.employeeId IN (:...accessibleIds)', {
        accessibleIds,
      });
    }
    if (query.employee_id) {
      reportQb.andWhere('report.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    }
    const reports = await reportQb
      .orderBy('report.activityDate', 'ASC')
      .addOrderBy('report.id', 'ASC')
      .getMany();
    if (!reports.length) return [];

    const employeeIds = [
      ...new Set(reports.map((report) => report.employeeId)),
    ];
    const employees = await this.employeeRepository.find({
      where: { company_id: companyId, id: In(employeeIds) },
      select: [
        'id',
        'first_name',
        'middle_name',
        'last_name',
        'employee_no',
        'primary_department_id',
      ],
    });
    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee]),
    );
    const filteredReports = reports.filter((report) => {
      const employee = employeeById.get(report.employeeId);
      return employee !== undefined;
    });
    if (!filteredReports.length) return [];
    const departmentHistory = await this.departmentHistoryRepository.find({
      where: {
        company_id: companyId,
        employee_id: In(employeeIds),
        is_primary: true,
      },
    });
    const entries = await this.entryRepository.find({
      where: {
        companyId,
        dailyActivityReportId: In(filteredReports.map((report) => report.id)),
        ...(query.activity_category_id
          ? { activityCategoryId: query.activity_category_id }
          : {}),
      },
      order: { id: 'ASC' },
    });
    const reportById = new Map(
      filteredReports.map((report) => [report.id, report]),
    );
    const now = Date.now();
    const rows: ActivityReportRow[] = [];
    for (const entry of entries) {
      const report = reportById.get(entry.dailyActivityReportId);
      if (!report) continue;
      const employee = employeeById.get(report.employeeId);
      if (!employee) continue;
      const departmentOnActivityDate =
        departmentHistory
          .filter(
            (assignment) =>
              assignment.employee_id === report.employeeId &&
              assignment.effective_from <= report.activityDate &&
              (!assignment.effective_to ||
                assignment.effective_to >= report.activityDate),
          )
          .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]
          ?.department_id ?? employee.primary_department_id;
      if (
        query.department_id &&
        departmentOnActivityDate !== query.department_id
      ) {
        continue;
      }
      const planned = PLANNED_STATUSES.has(entry.status);
      const deadline = entry.plannedEndTime ?? entry.dueDate;
      const deadlineMs = deadline ? new Date(deadline).getTime() : Number.NaN;
      const finishedAfterDeadline =
        entry.status === DailyActivityStatusEnum.COMPLETED &&
        entry.completionDate !== null &&
        Number.isFinite(deadlineMs) &&
        entry.completionDate.getTime() > deadlineMs;
      const overdue =
        planned &&
        !TERMINAL_STATUSES.has(entry.status) &&
        Number.isFinite(deadlineMs) &&
        deadlineMs < now;
      if (query.work_status && entry.status !== query.work_status) continue;
      if (query.overdue !== undefined && overdue !== query.overdue) continue;
      rows.push({
        entry_id: entry.id,
        report_id: report.id,
        employee_id: employee.id,
        employee_no: employee.employee_no,
        employee_name: [
          employee.first_name,
          employee.middle_name,
          employee.last_name,
        ]
          .filter(Boolean)
          .join(' '),
        department_id: departmentOnActivityDate,
        activity_date: report.activityDate,
        title: entry.title,
        activity_category_id: entry.activityCategoryId,
        status: entry.status,
        planned,
        completed: entry.status === DailyActivityStatusEnum.COMPLETED,
        overdue,
        completed_late: finishedAfterDeadline,
        due_date: entry.dueDate,
        planned_start_time: entry.plannedStartTime,
        planned_end_time: entry.plannedEndTime,
        completion_date: entry.completionDate,
        follow_up_date: entry.followUpDate,
        report_status: report.status,
      });
    }
    return rows;
  }

  private assertDateRange(dateFrom: string, dateTo: string) {
    const parse = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
        ? date
        : null;
    };
    const from = parse(dateFrom);
    const to = parse(dateTo);
    if (!from || !to || dateFrom > dateTo) {
      throw new BadRequestException('The reporting date range is invalid.');
    }
    if ((to.getTime() - from.getTime()) / 86_400_000 > 366) {
      throw new BadRequestException(
        'The reporting date range cannot exceed 367 calendar days.',
      );
    }
  }
}
