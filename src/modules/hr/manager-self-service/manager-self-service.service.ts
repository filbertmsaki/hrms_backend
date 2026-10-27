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
import { Employee } from '../employees/entities/employee.entity';
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
  ) {}

  private ensureCompanyId(actor: AuthenticatedUser): number {
    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required.');
    }
    return actor.companyId;
  }

  /**
   * Resolves the employee ids a manager is authorized to see, using the
   * Phase 1 data-scope service (company/branch/department/team/self), not
   * a bare `reports_to` lookup. Returns `null` for company-wide scope.
   */
  private async resolveScopedEmployeeIds(
    actor: AuthenticatedUser,
  ): Promise<number[] | null> {
    if (!actor.employeeId) {
      throw new ForbiddenException('A manager employee profile is required.');
    }

    return this.hrAccessService.getAccessibleEmployeeIds(actor);
  }

  async getTeamMembers(actor: AuthenticatedUser, query: ManagerTeamQueryDto) {
    const companyId = this.ensureCompanyId(actor);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const scopedEmployeeIds = await this.resolveScopedEmployeeIds(actor);

    if (scopedEmployeeIds !== null && scopedEmployeeIds.length === 0) {
      return {
        data: [],
        meta: { page, limit, total: 0, total_pages: 0 },
      };
    }

    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.company_user', 'membership')
      .leftJoinAndSelect('membership.user', 'user')
      .leftJoinAndSelect('employee.primary_branch', 'branch')
      .leftJoinAndSelect('employee.primary_department', 'department')
      .leftJoinAndSelect('employee.primary_position', 'position')
      .where('employee.company_id = :companyId', { companyId });

    if (scopedEmployeeIds !== null) {
      qb.andWhere('employee.id IN (:...employeeIds)', {
        employeeIds: scopedEmployeeIds,
      });
    }

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

    const scopedEmployeeIds = await this.resolveScopedEmployeeIds(actor);

    if (scopedEmployeeIds !== null && scopedEmployeeIds.length === 0) {
      return { data: [], meta: { page, limit, total: 0, total_pages: 0 } };
    }

    const qb = this.attendanceDailySummaryRepository
      .createQueryBuilder('s')
      .where('s.companyId = :companyId', { companyId })
      .orderBy('s.attendanceDate', 'DESC')
      .addOrderBy('s.employeeId', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (scopedEmployeeIds !== null) {
      qb.andWhere('s.employeeId IN (:...employeeIds)', {
        employeeIds: scopedEmployeeIds,
      });
    }

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
    const anchor = query.anchor_date ?? new Date().toISOString().slice(0, 10);
    const { dateFrom, dateTo } = this.resolveSummaryPeriod(anchor, periodType);
    const accessibleIds = await this.resolveScopedEmployeeIds(actor);
    if (accessibleIds !== null && accessibleIds.length === 0) {
      return {
        period: {
          period_type: periodType,
          date_from: dateFrom,
          date_to: dateTo,
        },
        data: [],
        totals: this.emptyActivitySummaryTotals(),
      };
    }

    const scopedIds = accessibleIds?.filter((id) => id !== actor.employeeId);
    if (scopedIds !== null && scopedIds?.length === 0) {
      return {
        period: {
          period_type: periodType,
          date_from: dateFrom,
          date_to: dateTo,
        },
        data: [],
        totals: this.emptyActivitySummaryTotals(),
      };
    }

    const employeeQuery = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', { companyId });
    if (scopedIds) {
      employeeQuery.andWhere('employee.id IN (:...employeeIds)', {
        employeeIds: scopedIds,
      });
    }
    const employees = await employeeQuery
      .orderBy('employee.first_name', 'ASC')
      .addOrderBy('employee.last_name', 'ASC')
      .getMany();
    if (!employees.length) {
      return {
        period: {
          period_type: periodType,
          date_from: dateFrom,
          date_to: dateTo,
        },
        data: [],
        totals: this.emptyActivitySummaryTotals(),
      };
    }

    const reports = await this.activityReportRepository.find({
      where: {
        companyId,
        employeeId: In(employees.map((employee) => employee.id)),
        activityDate: Between(dateFrom, dateTo),
      },
      order: { activityDate: 'ASC', employeeId: 'ASC' },
    });
    const reportIds = reports.map((report) => report.id);
    const entries = reportIds.length
      ? await this.activityEntryRepository.find({
          where: { companyId, dailyActivityReportId: In(reportIds) },
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
    const totals = data.reduce(
      (sum, row) => ({
        team_members: sum.team_members + 1,
        eligible_days: sum.eligible_days + row.eligible_days,
        submitted_days: sum.submitted_days + row.submitted_days,
        missing_days: sum.missing_days + row.missing_days,
        late_reports: sum.late_reports + row.late_reports,
        approved_reports: sum.approved_reports + row.approved_reports,
        planned_activities: sum.planned_activities + row.planned_activities,
        completed_activities:
          sum.completed_activities + row.completed_activities,
        deferred_activities: sum.deferred_activities + row.deferred_activities,
      }),
      this.emptyActivitySummaryTotals(),
    );
    return {
      period: { period_type: periodType, date_from: dateFrom, date_to: dateTo },
      data,
      totals: {
        ...totals,
        completion_rate: totals.planned_activities
          ? Number(
              (
                (totals.completed_activities / totals.planned_activities) *
                100
              ).toFixed(2),
            )
          : null,
      },
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
    const today = new Date().toISOString().slice(0, 10);
    const dateTo = query.date_to ?? today;
    const dateFrom = query.date_from ?? today;

    const scopedEmployeeIds = await this.resolveScopedEmployeeIds(actor);
    const hasNoAccess =
      scopedEmployeeIds !== null && scopedEmployeeIds.length === 0;

    const teamEmployeeIds = hasNoAccess
      ? []
      : (scopedEmployeeIds ??
        (
          await this.employeeRepository
            .createQueryBuilder('employee')
            .where('employee.company_id = :companyId', { companyId })
            .select('employee.id', 'id')
            .getRawMany<{ id: number }>()
        ).map((row) => Number(row.id)));

    const [
      openActions,
      attendanceSummary,
      employeesOnLeave,
      pendingCorrections,
      performanceSummary,
      workActivitySummary,
      pendingProbationRecommendations,
    ] = await Promise.all([
      this.actionItemsService.countOpen(companyId, actor.companyMembershipId!),
      this.getTeamAttendanceSummary(
        companyId,
        teamEmployeeIds,
        dateFrom,
        dateTo,
      ),
      this.countEmployeesOnLeave(companyId, teamEmployeeIds, today),
      this.countPendingCorrections(companyId, teamEmployeeIds),
      this.performanceInsightsService.getManagerSummary(actor),
      this.workActivityInsightsService.getManagerSummary(
        actor,
        dateFrom,
        dateTo,
      ),
      this.countPendingProbationRecommendations(companyId, actor.employeeId!),
    ]);

    return {
      generated_at: new Date().toISOString(),
      period: { date_from: dateFrom, date_to: dateTo, today },
      team: {
        total_members: teamEmployeeIds.length,
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
    employeeIds: number[],
    dateFrom: string,
    dateTo: string,
  ) {
    if (!employeeIds.length) {
      return {
        total_records: 0,
        present: 0,
        absent: 0,
        late: 0,
        early_departure: 0,
      };
    }

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
      .andWhere('summary.employeeId IN (:...employeeIds)', { employeeIds })
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
    employeeIds: number[],
    today: string,
  ): Promise<number> {
    if (!employeeIds.length) {
      return 0;
    }

    return this.leaveRequestRepository
      .createQueryBuilder('leave')
      .where('leave.company_id = :companyId', { companyId })
      .andWhere('leave.employee_id IN (:...employeeIds)', { employeeIds })
      .andWhere('leave.status = :status', { status: LeaveStatusEnum.APPROVED })
      .andWhere('leave.start_date <= :today', { today })
      .andWhere('leave.end_date >= :today', { today })
      .getCount();
  }

  private async countPendingCorrections(
    companyId: number,
    employeeIds: number[],
  ): Promise<number> {
    if (!employeeIds.length) {
      return 0;
    }

    return this.correctionRequestRepository
      .createQueryBuilder('request')
      .where('request.companyId = :companyId', { companyId })
      .andWhere('request.employeeId IN (:...employeeIds)', { employeeIds })
      .andWhere('request.status = :status', {
        status: SelfServiceRequestStatusEnum.SUBMITTED,
      })
      .getCount();
  }
}
