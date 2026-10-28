import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Between, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../shared/hr-access.service';
import { buildDashboardEmployeeSubquery } from '../dashboards/dashboard-employee-scope';
import { DashboardDateService } from '../dashboards/dashboard-date.service';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceCorrectionRequest } from '../self-service/entities/attendance-correction-request.entity';
import { SelfServiceRequestStatusEnum } from '../self-service/enums/self-service-request-status.enum';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { LeaveStatusEnum } from '../leave/enums/leave-status.enum';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { ManagerTeamQueryDto } from './dtos/manager-team-query.dto';
import { ManagerDashboardQueryDto } from './dtos/manager-dashboard-query.dto';
import { PerformanceInsightsService } from '../performance/services/performance-insights.service';
import { WorkActivityInsightsService } from '../work-activities/services/work-activity-insights.service';
import { ProbationCase } from '../probation/entities/probation-case.entity';
import { ProbationCaseStatusEnum } from '../probation/enums/probation-case-status.enum';
import {
  DailyActivityEntry,
  DailyActivityReport,
} from '../work-activities/entities/daily-activity.entities';
import {
  DailyActivityReportStatusEnum,
  DailyActivityStatusEnum,
} from '../work-activities/enums/work-activity.enums';
import {
  ManagerActivitySummaryPeriodEnum,
  ManagerActivitySummaryQueryDto,
} from './dtos/manager-activity-summary-query.dto';

@Injectable()
export class ManagerSelfServiceService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(AttendanceCorrectionRequest)
    private readonly correctionRequestRepository: Repository<AttendanceCorrectionRequest>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(ProbationCase)
    private readonly probationCaseRepository: Repository<ProbationCase>,
    @InjectRepository(DailyActivityReport)
    private readonly activityReportRepository: Repository<DailyActivityReport>,
    @InjectRepository(DailyActivityEntry)
    private readonly activityEntryRepository: Repository<DailyActivityEntry>,
    private readonly actionItemsService: ActionItemsService,
    private readonly performanceInsightsService: PerformanceInsightsService,
    private readonly workActivityInsightsService: WorkActivityInsightsService,
    private readonly dashboardDateService: DashboardDateService,
  ) {}

  private ensureCompanyId(actor: AuthenticatedUser): number {
    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required.');
    }
    return actor.companyId;
  }

  private async resolveEmployeeSqlScope(
    actor: AuthenticatedUser,
    excludeActor = false,
  ) {
    if (!actor.employeeId) {
      throw new ForbiddenException('A manager employee profile is required.');
    }
    const employeeScope = buildDashboardEmployeeSubquery(
      this.ensureCompanyId(actor),
      {},
      await this.hrAccessService.getAccessibleEmployeeSqlScope(actor),
    );
    if (!excludeActor) return employeeScope;

    return {
      sql: `${employeeScope.sql} AND employee_scope.id <> :excludedEmployeeId`,
      params: {
        ...employeeScope.params,
        excludedEmployeeId: actor.employeeId,
      },
    };
  }

  async getTeamMembers(actor: AuthenticatedUser, query: ManagerTeamQueryDto) {
    const companyId = this.ensureCompanyId(actor);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const employeeScope = await this.resolveEmployeeSqlScope(actor);

    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.company_user', 'membership')
      .leftJoinAndSelect('membership.user', 'user')
      .leftJoinAndSelect('employee.primary_branch', 'branch')
      .leftJoinAndSelect('employee.primary_department', 'department')
      .leftJoinAndSelect('employee.primary_position', 'position')
      .where('employee.company_id = :companyId', { companyId });

    qb.andWhere(`employee.id IN (${employeeScope.sql})`).setParameters(
      employeeScope.params,
    );

    if (query.direct_reports_only) {
      qb.andWhere('employee.reports_to = :managerEmployeeId', {
        managerEmployeeId: actor.employeeId,
      });
    }

    if (query.search) {
      qb.andWhere(
        `(
          LOWER(employee.employee_no) LIKE :search
          OR LOWER(employee.first_name) LIKE :search
          OR LOWER(employee.last_name) LIKE :search
        )`,
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    const [items, total] = await qb
      .orderBy('employee.first_name', 'ASC')
      .addOrderBy('employee.last_name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((employee) => ({
        id: employee.id,
        employee_no: employee.employee_no,
        full_name: [
          employee.first_name,
          employee.middle_name,
          employee.last_name,
        ]
          .filter(Boolean)
          .join(' '),
        employment_status: employee.employment_status,
        branch: employee.primary_branch,
        department: employee.primary_department,
        position: employee.primary_position,
        profile_photo_url: employee.profile_photo_url,
        account_status: employee.company_user?.status ?? null,
      })),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getTeamMemberSummary(actor: AuthenticatedUser, employeeId: number) {
    const companyId = this.ensureCompanyId(actor);

    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
      relations: {
        company_user: true,
        primary_branch: true,
        primary_department: true,
        primary_position: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    return {
      id: employee.id,
      employee_no: employee.employee_no,
      full_name: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      employment_status: employee.employment_status,
      hire_date: employee.hire_date,
      branch: employee.primary_branch,
      department: employee.primary_department,
      position: employee.primary_position,
      profile_photo_url: employee.profile_photo_url,
      account_status: employee.company_user?.status ?? null,
    };
  }

  async getTeamAttendance(
    actor: AuthenticatedUser,
    query: {
      page?: number;
      limit?: number;
      date_from?: string;
      date_to?: string;
    },
  ) {
    const companyId = this.ensureCompanyId(actor);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const employeeScope = await this.resolveEmployeeSqlScope(actor);

    const qb = this.attendanceDailySummaryRepository
      .createQueryBuilder('s')
      .where('s.companyId = :companyId', { companyId })
      .orderBy('s.attendanceDate', 'DESC')
      .addOrderBy('s.employeeId', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    qb.andWhere(`s.employeeId IN (${employeeScope.sql})`).setParameters(
      employeeScope.params,
    );

    if (query.date_from) {
      qb.andWhere('s.attendanceDate >= :dateFrom', {
        dateFrom: query.date_from,
      });
    }
    if (query.date_to) {
      qb.andWhere('s.attendanceDate <= :dateTo', { dateTo: query.date_to });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      data: items.map((s) => ({
        id: s.id,
        employee_id: s.employeeId,
        attendance_date: s.attendanceDate,
        status: s.attendanceStatus,
        check_in_at: s.checkInAt,
        check_out_at: s.checkOutAt,
        late_minutes: s.lateMinutes,
        early_departure_minutes: s.earlyDepartureMinutes,
      })),
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
  }

  async getActivitySummary(
    actor: AuthenticatedUser,
    query: ManagerActivitySummaryQueryDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const periodType =
      query.period_type ?? ManagerActivitySummaryPeriodEnum.MONTHLY;
    const dashboardPeriod = await this.dashboardDateService.resolve(
      {},
      companyId,
    );
    const anchor = query.anchor_date ?? dashboardPeriod.today;
    const { dateFrom, dateTo } = this.resolveSummaryPeriod(anchor, periodType);
    const employeeScope = await this.resolveEmployeeSqlScope(actor, true);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));

    const employeeQuery = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', { companyId });
    employeeQuery
      .andWhere(`employee.id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    const totalEmployees = await employeeQuery.clone().getCount();
    const employees = await employeeQuery
      .orderBy('employee.first_name', 'ASC')
      .addOrderBy('employee.last_name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const overallTotals = await this.getActivitySummaryTotals(
      companyId,
      employeeScope,
      dateFrom,
      dateTo,
    );
    if (!employees.length) {
      return {
        period: {
          period_type: periodType,
          anchor_date: anchor,
          date_from: dateFrom,
          date_to: dateTo,
          timezone: dashboardPeriod.timezone,
        },
        data: [],
        pagination: {
          page,
          limit,
          total: totalEmployees,
          total_pages: Math.ceil(totalEmployees / limit),
        },
        totals: overallTotals,
      };
    }

    const reports = await this.activityReportRepository.find({
      where: {
        companyId,
        employeeId: In(employees.map((employee) => employee.id)),
        activityDate: Between(dateFrom, dateTo),
      },
      select: {
        id: true,
        employeeId: true,
        activityDate: true,
        status: true,
        submissionIsLate: true,
        submittedAt: true,
      },
      order: { activityDate: 'ASC', employeeId: 'ASC' },
    });
    const reportIds = reports.map((report) => report.id);
    const entries = reportIds.length
      ? await this.activityEntryRepository.find({
          where: { companyId, dailyActivityReportId: In(reportIds) },
          select: { dailyActivityReportId: true, status: true },
          order: { dailyActivityReportId: 'ASC', id: 'ASC' },
        })
      : [];
    const entriesByReport = new Map<number, DailyActivityEntry[]>();
    for (const entry of entries) {
      const reportEntries =
        entriesByReport.get(entry.dailyActivityReportId) ?? [];
      reportEntries.push(entry);
      entriesByReport.set(entry.dailyActivityReportId, reportEntries);
    }
    const reportsByEmployee = new Map<number, DailyActivityReport[]>();
    for (const report of reports) {
      const employeeReports = reportsByEmployee.get(report.employeeId) ?? [];
      employeeReports.push(report);
      reportsByEmployee.set(report.employeeId, employeeReports);
    }
    const eligibleDays = this.listDates(dateFrom, dateTo);
    const data = employees.map((employee) => {
      const eligibleDates = eligibleDays.filter((date) =>
        this.isEmployeeEmployedOn(employee, date),
      );
      const employeeReports = reportsByEmployee.get(employee.id) ?? [];
      const activeReports = employeeReports.filter(
        (report) => report.status !== DailyActivityReportStatusEnum.CANCELLED,
      );
      const reportStatusCounts: Record<string, number> = {};
      let lateReports = 0;
      let approvedReports = 0;
      let plannedActivities = 0;
      let completedActivities = 0;
      let deferredActivities = 0;
      const daily = activeReports.map((report) => {
        reportStatusCounts[report.status] =
          (reportStatusCounts[report.status] ?? 0) + 1;
        if (report.submissionIsLate) lateReports += 1;
        if (
          report.status === DailyActivityReportStatusEnum.APPROVED ||
          report.status === DailyActivityReportStatusEnum.LOCKED
        ) {
          approvedReports += 1;
        }
        let plannedCount = 0;
        let completedCount = 0;
        let deferredCount = 0;
        for (const entry of entriesByReport.get(report.id) ?? []) {
          if (entry.status !== DailyActivityStatusEnum.CANCELLED)
            plannedCount += 1;
          if (entry.status === DailyActivityStatusEnum.COMPLETED)
            completedCount += 1;
          if (entry.status === DailyActivityStatusEnum.DEFERRED)
            deferredCount += 1;
        }
        plannedActivities += plannedCount;
        completedActivities += completedCount;
        deferredActivities += deferredCount;
        return {
          report_id: report.id,
          activity_date: report.activityDate,
          status: report.status,
          submitted_at: report.submittedAt,
          is_late: report.submissionIsLate,
          planned_activities: plannedCount,
          completed_activities: completedCount,
          deferred_activities: deferredCount,
        };
      });
      const submittedDays = new Set(
        activeReports
          .filter(
            (report) =>
              report.status !== DailyActivityReportStatusEnum.DRAFT &&
              report.status !== DailyActivityReportStatusEnum.CANCELLED,
          )
          .map((report) => report.activityDate),
      ).size;
      return {
        employee_id: employee.id,
        employee_no: employee.employee_no,
        employee_name: [
          employee.first_name,
          employee.middle_name,
          employee.last_name,
        ]
          .filter(Boolean)
          .join(' '),
        eligible_days: eligibleDates.length,
        submitted_days: submittedDays,
        missing_days: Math.max(0, eligibleDates.length - submittedDays),
        late_reports: lateReports,
        approved_reports: approvedReports,
        report_status_counts: reportStatusCounts,
        planned_activities: plannedActivities,
        completed_activities: completedActivities,
        deferred_activities: deferredActivities,
        completion_rate: plannedActivities
          ? Number(((completedActivities / plannedActivities) * 100).toFixed(2))
          : null,
        daily,
      };
    });
    return {
      period: {
        period_type: periodType,
        anchor_date: anchor,
        date_from: dateFrom,
        date_to: dateTo,
        timezone: dashboardPeriod.timezone,
      },
      data,
      pagination: {
        page,
        limit,
        total: totalEmployees,
        total_pages: Math.ceil(totalEmployees / limit),
      },
      totals: overallTotals,
    };
  }

  private async getActivitySummaryTotals(
    companyId: number,
    employeeScope: { sql: string; params: Record<string, unknown> },
    dateFrom: string,
    dateTo: string,
  ) {
    const row = await this.employeeRepository
      .createQueryBuilder('employee')
      .select('COUNT(employee.id)', 'team_members')
      .addSelect(
        `COALESCE(SUM(CASE
          WHEN employee.employment_status = :activeStatus
            OR (employee.employment_status IN (:...terminalStatuses) AND employee.exit_date IS NOT NULL)
          THEN GREATEST(0, LEAST(COALESCE(employee.exit_date, CAST(:dateTo AS date)), CAST(:dateTo AS date))
            - GREATEST(COALESCE(employee.hire_date, CAST(:dateFrom AS date)), CAST(:dateFrom AS date)) + 1)
          ELSE 0 END), 0)`,
        'eligible_days',
      )
      .addSelect(
        `COALESCE(SUM((SELECT COUNT(DISTINCT report.activity_date)
          FROM daily_activity_reports report
          WHERE report.company_id = employee.company_id
            AND report.employee_id = employee.id
            AND report.activity_date BETWEEN :dateFrom AND :dateTo
            AND report.status NOT IN (:...nonSubmittedStatuses))), 0)`,
        'submitted_days',
      )
      .addSelect(
        `COALESCE(SUM((SELECT COUNT(report.id)
          FROM daily_activity_reports report
          WHERE report.company_id = employee.company_id
            AND report.employee_id = employee.id
            AND report.activity_date BETWEEN :dateFrom AND :dateTo
            AND report.submission_is_late = TRUE
            AND report.status <> :cancelledStatus)), 0)`,
        'late_reports',
      )
      .addSelect(
        `COALESCE(SUM((SELECT COUNT(report.id)
          FROM daily_activity_reports report
          WHERE report.company_id = employee.company_id
            AND report.employee_id = employee.id
            AND report.activity_date BETWEEN :dateFrom AND :dateTo
            AND report.status IN (:...approvedStatuses))), 0)`,
        'approved_reports',
      )
      .addSelect(
        `COALESCE(SUM((SELECT COUNT(entry.id)
          FROM daily_activity_reports report
          INNER JOIN daily_activity_entries entry
            ON entry.company_id = report.company_id
            AND entry.daily_activity_report_id = report.id
          WHERE report.company_id = employee.company_id
            AND report.employee_id = employee.id
            AND report.activity_date BETWEEN :dateFrom AND :dateTo
            AND report.status <> :cancelledStatus
            AND entry.status <> :entryCancelledStatus)), 0)`,
        'planned_activities',
      )
      .addSelect(
        `COALESCE(SUM((SELECT COUNT(entry.id)
          FROM daily_activity_reports report
          INNER JOIN daily_activity_entries entry
            ON entry.company_id = report.company_id
            AND entry.daily_activity_report_id = report.id
          WHERE report.company_id = employee.company_id
            AND report.employee_id = employee.id
            AND report.activity_date BETWEEN :dateFrom AND :dateTo
            AND report.status <> :cancelledStatus
            AND entry.status = :completedStatus)), 0)`,
        'completed_activities',
      )
      .addSelect(
        `COALESCE(SUM((SELECT COUNT(entry.id)
          FROM daily_activity_reports report
          INNER JOIN daily_activity_entries entry
            ON entry.company_id = report.company_id
            AND entry.daily_activity_report_id = report.id
          WHERE report.company_id = employee.company_id
            AND report.employee_id = employee.id
            AND report.activity_date BETWEEN :dateFrom AND :dateTo
            AND report.status <> :cancelledStatus
            AND entry.status = :deferredStatus)), 0)`,
        'deferred_activities',
      )
      .where('employee.company_id = :companyId', { companyId })
      .andWhere(`employee.id IN (${employeeScope.sql})`)
      .setParameters({
        ...employeeScope.params,
        dateFrom,
        dateTo,
        activeStatus: EmploymentStatusEnum.ACTIVE,
        terminalStatuses: [
          EmploymentStatusEnum.RESIGNED,
          EmploymentStatusEnum.TERMINATED,
          EmploymentStatusEnum.RETIRED,
          EmploymentStatusEnum.DECEASED,
          EmploymentStatusEnum.EXITED,
          EmploymentStatusEnum.INACTIVE,
        ],
        nonSubmittedStatuses: [
          DailyActivityReportStatusEnum.DRAFT,
          DailyActivityReportStatusEnum.CANCELLED,
        ],
        cancelledStatus: DailyActivityReportStatusEnum.CANCELLED,
        approvedStatuses: [
          DailyActivityReportStatusEnum.APPROVED,
          DailyActivityReportStatusEnum.LOCKED,
        ],
        entryCancelledStatus: DailyActivityStatusEnum.CANCELLED,
        completedStatus: DailyActivityStatusEnum.COMPLETED,
        deferredStatus: DailyActivityStatusEnum.DEFERRED,
      })
      .getRawOne<{
        team_members: number | string;
        eligible_days: number | string;
        submitted_days: number | string;
        late_reports: number | string;
        approved_reports: number | string;
        planned_activities: number | string;
        completed_activities: number | string;
        deferred_activities: number | string;
      }>();
    const eligibleDays = Number(row?.eligible_days ?? 0);
    const submittedDays = Number(row?.submitted_days ?? 0);
    const totals = {
      team_members: Number(row?.team_members ?? 0),
      eligible_days: eligibleDays,
      submitted_days: submittedDays,
      missing_days: Math.max(0, eligibleDays - submittedDays),
      late_reports: Number(row?.late_reports ?? 0),
      approved_reports: Number(row?.approved_reports ?? 0),
      planned_activities: Number(row?.planned_activities ?? 0),
      completed_activities: Number(row?.completed_activities ?? 0),
      deferred_activities: Number(row?.deferred_activities ?? 0),
    };
    return {
      ...totals,
      completion_rate: totals.planned_activities
        ? Number(
            (
              (totals.completed_activities / totals.planned_activities) *
              100
            ).toFixed(2),
          )
        : null,
    };
  }

  private resolveSummaryPeriod(
    anchor: string,
    periodType: ManagerActivitySummaryPeriodEnum,
  ) {
    const date = new Date(`${anchor}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('A valid summary date is required.');
    }
    if (periodType === ManagerActivitySummaryPeriodEnum.WEEKLY) {
      const day = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - day);
      const dateFrom = date.toISOString().slice(0, 10);
      date.setUTCDate(date.getUTCDate() + 6);
      return { dateFrom, dateTo: date.toISOString().slice(0, 10) };
    }
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return {
      dateFrom: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
      dateTo: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
    };
  }

  private listDates(from: string, to: string): string[] {
    const dates: string[] = [];
    const date = new Date(`${from}T00:00:00.000Z`);
    const final = new Date(`${to}T00:00:00.000Z`);
    while (date <= final) {
      dates.push(date.toISOString().slice(0, 10));
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return dates;
  }

  private isEmployeeEmployedOn(employee: Employee, date: string): boolean {
    if (employee.hire_date && employee.hire_date > date) return false;
    if (employee.exit_date && employee.exit_date < date) return false;
    const terminal = new Set([
      'RESIGNED',
      'TERMINATED',
      'RETIRED',
      'DECEASED',
      'EXITED',
      'INACTIVE',
    ]);
    const status = String(employee.employment_status).toUpperCase();
    return (
      status === 'ACTIVE' ||
      (terminal.has(status) && Boolean(employee.exit_date))
    );
  }

  private emptyActivitySummaryTotals() {
    return {
      team_members: 0,
      eligible_days: 0,
      submitted_days: 0,
      missing_days: 0,
      late_reports: 0,
      approved_reports: 0,
      planned_activities: 0,
      completed_activities: 0,
      deferred_activities: 0,
      completion_rate: null as number | null,
    };
  }

  async getDashboard(
    actor: AuthenticatedUser,
    query: ManagerDashboardQueryDto,
  ) {
    const companyId = this.ensureCompanyId(actor);
    const period = await this.dashboardDateService.resolve(query, companyId);
    const { today, dateFrom, dateTo } = period;

    const employeeScope = buildDashboardEmployeeSubquery(
      companyId,
      {},
      await this.hrAccessService.getAccessibleEmployeeSqlScope(actor),
    );

    const [
      teamEmployeeCount,
      openActions,
      attendanceSummary,
      employeesOnLeave,
      pendingCorrections,
      performanceSummary,
      workActivitySummary,
      pendingProbationRecommendations,
    ] = await Promise.all([
      this.countTeamMembers(companyId, employeeScope.sql, employeeScope.params),
      this.actionItemsService.countOpen(companyId, actor.companyMembershipId!),
      this.getTeamAttendanceSummary(
        companyId,
        employeeScope.sql,
        employeeScope.params,
        dateFrom,
        dateTo,
      ),
      this.countEmployeesOnLeave(
        companyId,
        employeeScope.sql,
        employeeScope.params,
        today,
      ),
      this.countPendingCorrections(
        companyId,
        employeeScope.sql,
        employeeScope.params,
      ),
      this.performanceInsightsService.getManagerSummary(
        actor,
        dateFrom,
        dateTo,
      ),
      this.workActivityInsightsService.getManagerSummary(
        actor,
        dateFrom,
        dateTo,
      ),
      this.countPendingProbationRecommendations(companyId, actor.employeeId!),
    ]);

    return {
      generated_at: new Date().toISOString(),
      period: {
        date_from: dateFrom,
        date_to: dateTo,
        today,
        timezone: period.timezone,
      },
      team: {
        total_members: teamEmployeeCount,
        employees_on_leave: employeesOnLeave,
      },
      attendance: attendanceSummary,
      approvals: {
        open_action_items: openActions,
        pending_attendance_corrections: pendingCorrections,
      },
      performance: performanceSummary,
      work_activities: workActivitySummary,
      capabilities: {
        activity_review: {
          available: true,
          pending_activity_reviews:
            workActivitySummary.pending_activity_reviews,
        },
        kpi_review: {
          available: true,
          pending_team_validations: performanceSummary.pending_team_validations,
          published_team_reviews: performanceSummary.published_team_reviews,
        },
        probation_recommendation: {
          available: true,
          pending_recommendations: pendingProbationRecommendations,
        },
      },
    };
  }

  private countTeamMembers(
    companyId: number,
    employeeScopeSql: string,
    employeeScopeParams: Record<string, unknown>,
  ): Promise<number> {
    return this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', { companyId })
      .andWhere(`employee.id IN (${employeeScopeSql})`)
      .setParameters(employeeScopeParams)
      .getCount();
  }

  private countPendingProbationRecommendations(
    companyId: number,
    managerEmployeeId: number,
  ): Promise<number> {
    return this.probationCaseRepository.count({
      where: {
        companyId,
        managerEmployeeId,
        status: ProbationCaseStatusEnum.MANAGER_REVIEW_PENDING,
      },
    });
  }

  private async getTeamAttendanceSummary(
    companyId: number,
    employeeScopeSql: string,
    employeeScopeParams: Record<string, unknown>,
    dateFrom: string,
    dateTo: string,
  ) {
    const result = await this.attendanceDailySummaryRepository
      .createQueryBuilder('summary')
      .select('COUNT(*)', 'total_records')
      .addSelect(
        `SUM(CASE WHEN summary.attendanceStatus = 'PRESENT' THEN 1 ELSE 0 END)`,
        'present',
      )
      .addSelect(
        `SUM(CASE WHEN summary.attendanceStatus = 'ABSENT' THEN 1 ELSE 0 END)`,
        'absent',
      )
      .addSelect(
        `SUM(CASE WHEN summary.lateMinutes > 0 THEN 1 ELSE 0 END)`,
        'late',
      )
      .addSelect(
        `SUM(CASE WHEN summary.earlyDepartureMinutes > 0 THEN 1 ELSE 0 END)`,
        'early_departure',
      )
      .where('summary.companyId = :companyId', { companyId })
      .andWhere(`summary.employeeId IN (${employeeScopeSql})`)
      .setParameters(employeeScopeParams)
      .andWhere('summary.attendanceDate >= :dateFrom', { dateFrom })
      .andWhere('summary.attendanceDate <= :dateTo', { dateTo })
      .getRawOne<{
        total_records: string;
        present: string;
        absent: string;
        late: string;
        early_departure: string;
      }>();

    return {
      total_records: Number(result?.total_records ?? 0),
      present: Number(result?.present ?? 0),
      absent: Number(result?.absent ?? 0),
      late: Number(result?.late ?? 0),
      early_departure: Number(result?.early_departure ?? 0),
    };
  }

  private async countEmployeesOnLeave(
    companyId: number,
    employeeScopeSql: string,
    employeeScopeParams: Record<string, unknown>,
    today: string,
  ): Promise<number> {
    return this.leaveRequestRepository
      .createQueryBuilder('leave')
      .where('leave.company_id = :companyId', { companyId })
      .andWhere(`leave.employee_id IN (${employeeScopeSql})`)
      .setParameters(employeeScopeParams)
      .andWhere('leave.status = :status', { status: LeaveStatusEnum.APPROVED })
      .andWhere('leave.start_date <= :today', { today })
      .andWhere('leave.end_date >= :today', { today })
      .getCount();
  }

  private async countPendingCorrections(
    companyId: number,
    employeeScopeSql: string,
    employeeScopeParams: Record<string, unknown>,
  ): Promise<number> {
    return this.correctionRequestRepository
      .createQueryBuilder('request')
      .where('request.companyId = :companyId', { companyId })
      .andWhere(`request.employeeId IN (${employeeScopeSql})`)
      .setParameters(employeeScopeParams)
      .andWhere('request.status = :status', {
        status: SelfServiceRequestStatusEnum.SUBMITTED,
      })
      .getCount();
  }
}
