import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { EmployeeDepartmentAssignmentHistory } from '../../employees/entities/employee-department-assignment-history.entity';
import {
  DailyActivityEntry,
  DailyActivityReport,
} from '../entities/daily-activity.entities';
import { DailyActivityReportStatusEnum } from '../enums/work-activity.enums';
import { WorkActivityEligibilityService } from './work-activity-eligibility.service';
import { HrAccessService } from '../../shared/hr-access.service';

type ReportingQuery = {
  date_from?: string;
  date_to?: string;
  department_id?: number;
  employee_id?: number;
  branch_id?: number;
  status?: string;
  page?: number;
  limit?: number;
};

const SUBMITTED_STATUSES = new Set<DailyActivityReportStatusEnum>([
  DailyActivityReportStatusEnum.SUBMITTED,
  DailyActivityReportStatusEnum.MANAGER_REVIEW_PENDING,
  DailyActivityReportStatusEnum.RETURNED_FOR_CORRECTION,
  DailyActivityReportStatusEnum.APPROVED,
  DailyActivityReportStatusEnum.LOCKED,
]);
const DAY_MS = 86_400_000;

/** Department summaries and missing-report rows share Module 8 eligibility. */
@Injectable()
export class WorkActivityReportingService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly eligibilityService: WorkActivityEligibilityService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(EmployeeDepartmentAssignmentHistory)
    private readonly departmentHistoryRepository: Repository<EmployeeDepartmentAssignmentHistory>,
    @InjectRepository(DailyActivityReport)
    private readonly reportRepository: Repository<DailyActivityReport>,
    @InjectRepository(DailyActivityEntry)
    private readonly entryRepository: Repository<DailyActivityEntry>,
  ) {}

  async getDepartmentSummary(actor: AuthenticatedUser, query: ReportingQuery) {
    const data = await this.buildRows(actor, query);
    const departments = new Map<
      number | null,
      {
        department_id: number | null;
        department_name: string;
        eligible_employee_days: number;
        submitted_reports: number;
        pending_reports: number;
        completion_percent: number;
      }
    >();
    for (const row of data.rows) {
      const key = row.department_id;
      let summary = departments.get(key);
      if (!summary) {
        summary = {
          department_id: key,
          department_name: row.department_name,
          eligible_employee_days: 0,
          submitted_reports: 0,
          pending_reports: 0,
          completion_percent: 0,
        };
        departments.set(key, summary);
      }
      summary.eligible_employee_days += 1;
      if (row.submitted) summary.submitted_reports += 1;
      else summary.pending_reports += 1;
    }
    const summaries = [...departments.values()]
      .map((row) => ({
        ...row,
        completion_percent: row.eligible_employee_days
          ? Math.round(
              (row.submitted_reports / row.eligible_employee_days) * 10000,
            ) / 100
          : 0,
      }))
      .sort((a, b) => a.department_name.localeCompare(b.department_name));
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const start = (page - 1) * limit;
    return {
      data: summaries.slice(start, start + limit),
      meta: {
        page,
        limit,
        total: summaries.length,
        total_pages: Math.ceil(summaries.length / limit),
      },
      totals: {
        eligible_employee_days: data.rows.length,
        submitted_reports: data.rows.filter((row) => row.submitted).length,
        pending_reports: data.rows.filter((row) => !row.submitted).length,
      },
    };
  }

  async getPendingReports(actor: AuthenticatedUser, query: ReportingQuery) {
    const { rows } = await this.buildRows(actor, query);
    const pending = rows.filter((row) => !row.submitted);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const start = (page - 1) * limit;
    return {
      data: pending.slice(start, start + limit),
      meta: {
        page,
        limit,
        total: pending.length,
        total_pages: Math.ceil(pending.length / limit),
      },
      totals: {
        eligible_employee_days: rows.length,
        pending_reports: pending.length,
      },
    };
  }

  async exportPendingReports(actor: AuthenticatedUser, query: ReportingQuery) {
    const { rows } = await this.buildRows(actor, query);
    return rows.filter((row) => !row.submitted);
  }

  /** Trusted scheduled-report path; the caller supplies the tenant explicitly. */
  async exportPendingReportsForCompany(
    companyId: number,
    query: ReportingQuery,
  ) {
    const { rows } = await this.buildRows(null, query, companyId);
    return rows.filter((row) => !row.submitted);
  }

  async exportDepartmentSummary(
    actor: AuthenticatedUser,
    query: ReportingQuery,
  ) {
    const result = await this.getDepartmentSummary(actor, {
      ...query,
      page: 1,
      limit: 100,
    });
    if (result.meta.total > 100) {
      const { rows } = await this.buildRows(actor, query);
      const grouped = new Map<
        string,
        {
          department_id: number | null;
          department_name: string;
          eligible_employee_days: number;
          submitted_reports: number;
          pending_reports: number;
        }
      >();
      for (const row of rows) {
        const key = String(row.department_id ?? 'unassigned');
        const current = grouped.get(key) ?? {
          department_id: row.department_id,
          department_name: row.department_name,
          eligible_employee_days: 0,
          submitted_reports: 0,
          pending_reports: 0,
        };
        current.eligible_employee_days += 1;
        if (row.submitted) current.submitted_reports += 1;
        else current.pending_reports += 1;
        grouped.set(key, current);
      }
      return [...grouped.values()].map((row) => ({
        ...row,
        completion_percent: row.eligible_employee_days
          ? Math.round(
              (row.submitted_reports / row.eligible_employee_days) * 10000,
            ) / 100
          : 0,
      }));
    }
    return result.data;
  }

  private async buildRows(
    actor: AuthenticatedUser | null,
    query: ReportingQuery,
    trustedCompanyId?: number,
  ) {
    const companyId =
      trustedCompanyId ?? this.hrAccessService.ensureActorCompanyId(actor!);
    const { start, end } = this.resolveDates(query);
    const accessibleIds = actor
      ? await this.hrAccessService.getAccessibleEmployeeIds(actor)
      : null;
    if (accessibleIds && accessibleIds.length === 0) return { rows: [] };
    const employeeQb = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', { companyId });
    if (accessibleIds)
      employeeQb.andWhere('employee.id IN (:...accessibleIds)', {
        accessibleIds,
      });
    if (query.employee_id)
      employeeQb.andWhere('employee.id = :employeeId', {
        employeeId: query.employee_id,
      });
    if (query.branch_id)
      employeeQb.andWhere('employee.primary_branch_id = :branchId', {
        branchId: query.branch_id,
      });
    if (query.department_id) {
      const dept = await this.departmentRepository.findOne({
        where: { id: query.department_id, company_id: companyId },
      });
      if (!dept) return { rows: [] };
      employeeQb.andWhere(
        '(employee.primary_department_id = :departmentId OR EXISTS (SELECT 1 FROM employee_department_assignment_history filter_assignment WHERE filter_assignment.employee_id = employee.id AND filter_assignment.company_id = :companyId AND filter_assignment.department_id = :departmentId AND filter_assignment.effective_from <= :endDate AND (filter_assignment.effective_to IS NULL OR filter_assignment.effective_to >= :startDate)))',
        {
          departmentId: query.department_id,
          companyId,
          startDate: start,
          endDate: end,
        },
      );
    }
    const employees = await employeeQb.orderBy('employee.id', 'ASC').getMany();
    const reports = await this.reportRepository
      .createQueryBuilder('report')
      .where('report.companyId = :companyId', { companyId })
      .andWhere(
        'report.activityDate >= :startDate AND report.activityDate <= :endDate',
        { startDate: start, endDate: end },
      )
      .andWhere('report.employeeId IN (:...employeeIds)', {
        employeeIds: employees.length
          ? employees.map((employee) => employee.id)
          : [-1],
      })
      .getMany();
    const reportByEmployeeDate = new Map(
      reports.map((report) => [
        `${report.employeeId}:${report.activityDate}`,
        report,
      ]),
    );
    const reportIds = reports.map((report) => report.id);
    const entries = reportIds.length
      ? await this.entryRepository.find({
          where: {
            companyId,
            dailyActivityReportId: In(reportIds),
          },
          select: ['id', 'dailyActivityReportId', 'origin', 'status'],
        })
      : [];
    const taskCountsByReport = new Map<
      number,
      {
        entryCount: number;
        assignedCount: number;
        completedCount: number;
        openCount: number;
      }
    >();
    for (const entry of entries) {
      const counts = taskCountsByReport.get(entry.dailyActivityReportId) ?? {
        entryCount: 0,
        assignedCount: 0,
        completedCount: 0,
        openCount: 0,
      };
      counts.entryCount += 1;
      if (String(entry.origin) === 'ASSIGNED') counts.assignedCount += 1;
      if (String(entry.status) === 'COMPLETED') counts.completedCount += 1;
      else if (String(entry.status) !== 'CANCELLED') counts.openCount += 1;
      taskCountsByReport.set(entry.dailyActivityReportId, counts);
    }
    const history = await this.departmentHistoryRepository
      .createQueryBuilder('assignment')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere('assignment.employee_id IN (:...employeeIds)', {
        employeeIds: employees.length
          ? employees.map((employee) => employee.id)
          : [-1],
      })
      .andWhere('assignment.is_primary = true')
      .andWhere(
        'assignment.effective_from <= :endDate AND (assignment.effective_to IS NULL OR assignment.effective_to >= :startDate)',
        { startDate: start, endDate: end },
      )
      .getMany();
    const departmentIds = new Set<number>();
    employees.forEach((employee) => {
      if (employee.primary_department_id)
        departmentIds.add(employee.primary_department_id);
    });
    history.forEach((item) => departmentIds.add(item.department_id));
    const departments = departmentIds.size
      ? await this.departmentRepository.find({
          where: { company_id: companyId },
        })
      : [];
    const departmentById = new Map(
      departments.map((department) => [department.id, department]),
    );
    const rows: Array<
      Record<string, unknown> & {
        submitted: boolean;
        department_id: number | null;
        department_name: string;
      }
    > = [];
    for (const employee of employees) {
      for (let day = start; day <= end; day = this.nextDate(day)) {
        const eligibility = await this.eligibilityService.evaluate(
          employee,
          day,
        );
        if (!eligibility.eligible) continue;
        const assignments = history.filter(
          (item) =>
            item.employee_id === employee.id &&
            item.effective_from <= day &&
            (!item.effective_to || item.effective_to >= day),
        );
        const assignment = assignments.sort((a, b) =>
          b.effective_from.localeCompare(a.effective_from),
        )[0];
        const departmentId =
          assignment?.department_id ?? employee.primary_department_id ?? null;
        if (query.department_id && departmentId !== query.department_id)
          continue;
        const report = reportByEmployeeDate.get(`${employee.id}:${day}`);
        const taskCounts = report
          ? taskCountsByReport.get(report.id)
          : undefined;
        const submitted = Boolean(
          report && SUBMITTED_STATUSES.has(report.status),
        );
        rows.push({
          employee_id: employee.id,
          employee_no: employee.employee_no,
          employee_name: [
            employee.first_name,
            employee.middle_name,
            employee.last_name,
          ]
            .filter(Boolean)
            .join(' '),
          department_id: departmentId,
          department_name: departmentId
            ? (departmentById.get(departmentId)?.name ?? 'Unknown department')
            : 'Unassigned',
          activity_date: day,
          report_id: report?.id ?? null,
          report_status: report?.status ?? 'MISSING',
          submitted,
          is_workday: eligibility.isWorkday,
          is_off_day: eligibility.isOffDay,
          is_holiday: eligibility.isHoliday,
          has_approved_leave: eligibility.hasApprovedLeave,
          activity_entry_count: taskCounts?.entryCount ?? 0,
          assigned_task_count: taskCounts?.assignedCount ?? 0,
          completed_task_count: taskCounts?.completedCount ?? 0,
          open_task_count: taskCounts?.openCount ?? 0,
        });
      }
    }
    rows.sort(
      (a, b) =>
        String(b.activity_date).localeCompare(String(a.activity_date)) ||
        Number(a.employee_id) - Number(b.employee_id),
    );
    return {
      rows: query.status
        ? rows.filter((row) => row.report_status === query.status)
        : rows,
    };
  }

  private resolveDates(query: ReportingQuery) {
    const today = new Date().toISOString().slice(0, 10);
    const start = query.date_from ?? query.date_to ?? today;
    const end = query.date_to ?? query.date_from ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
      throw new BadRequestException(
        'Use ISO calendar dates for the reporting range.',
      );
    const from = new Date(`${start}T00:00:00.000Z`);
    const to = new Date(`${end}T00:00:00.000Z`);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from.toISOString().slice(0, 10) !== start ||
      to.toISOString().slice(0, 10) !== end ||
      start > end
    )
      throw new BadRequestException('The reporting date range is invalid.');
    if ((to.getTime() - from.getTime()) / DAY_MS > 366)
      throw new BadRequestException(
        'The reporting date range cannot exceed 367 calendar days.',
      );
    return { start, end };
  }

  private nextDate(date: string) {
    return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + DAY_MS)
      .toISOString()
      .slice(0, 10);
  }
}
