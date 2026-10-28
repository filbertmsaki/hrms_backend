import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../shared/hr-access.service';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceDailyStatusEnum } from '../attendance/processing/enums/attendance-daily-status.enum';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { LeaveStatusEnum } from '../leave/enums/leave-status.enum';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OnboardingRequestStatusEnum } from '../onboarding/enums/onboarding-request-status.enum';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { OffboardingRequestStatusEnum } from '../offboarding/enums/offboarding-request-status.enum';
import { OffboardingTypeEnum } from '../offboarding/enums/offboarding-type.enum';
import { PerformanceInsightsService } from '../performance/services/performance-insights.service';
import { WorkActivityInsightsService } from '../work-activities/services/work-activity-insights.service';
import { PayrollReportsService } from '../payroll/services/payroll-core.services';
import { EmployeeFinanceReportsService } from '../employee-finance/services/employee-finance-core.services';
import { DashboardDateService } from './dashboard-date.service';
import { DashboardQueryDto } from './dtos/dashboard-query.dto';
import {
  buildDashboardEmployeeSubquery,
  DashboardEmployeeSubquery,
} from './dashboard-employee-scope';
import { hasAnyPermission } from '../../../common/utils/permission.util';
import { resolveCompanyAggregateAccess } from './dashboard-sensitive-access';
import { DashboardLeaveService } from './dashboard-leave.service';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { isolateDashboardSource } from './dashboard-api-contract';

const CLOSED_ONBOARDING_STATUSES = [
  OnboardingRequestStatusEnum.COMPLETED,
  OnboardingRequestStatusEnum.REJECTED,
  OnboardingRequestStatusEnum.CANCELLED,
];

const CLOSED_OFFBOARDING_STATUSES = [
  OffboardingRequestStatusEnum.COMPLETED,
  OffboardingRequestStatusEnum.REJECTED,
  OffboardingRequestStatusEnum.CANCELLED,
];

@Injectable()
export class ManagementDashboardService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly dateService: DashboardDateService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(OnboardingRequest)
    private readonly onboardingRequestRepository: Repository<OnboardingRequest>,
    @InjectRepository(OffboardingRequest)
    private readonly offboardingRequestRepository: Repository<OffboardingRequest>,
    private readonly performanceInsightsService: PerformanceInsightsService,
    private readonly workActivityInsightsService: WorkActivityInsightsService,
    private readonly payrollReportsService: PayrollReportsService,
    private readonly employeeFinanceReportsService: EmployeeFinanceReportsService,
    private readonly dashboardLeaveService: DashboardLeaveService,
    private readonly actionItemsService: ActionItemsService,
  ) {}

  async getDashboard(actor: AuthenticatedUser, query: DashboardQueryDto) {
    const companyId = actor.companyId!;
    const period = await this.dateService.resolve(query, companyId);

    const accessScope =
      await this.hrAccessService.getAccessibleEmployeeSqlScope(actor);
    const employeeScope = buildDashboardEmployeeSubquery(
      companyId,
      query,
      accessScope,
    );
    const dashboardFilters = {
      ...(query.branch_id ? { branch_id: query.branch_id } : {}),
      ...(query.department_id ? { department_id: query.department_id } : {}),
      ...(query.employee_id ? { employee_id: query.employee_id } : {}),
    };

    // These nested services only return company-wide totals, so require both
    // their source grant and a matching company-wide dashboard scope.
    const payrollAccess = resolveCompanyAggregateAccess(actor, query, [
      'payroll:reports',
      'payroll:runs:read',
    ]);
    const employeeFinanceAccess = resolveCompanyAggregateAccess(actor, query, [
      'employee_finance:reports',
      'employee_finance:accounts:read',
    ]);
    const canReadPerformanceAggregates = hasAnyPermission(actor.permissions, [
      'performance_aggregates:read',
    ]);

    const [departmentHeadcount, branchHeadcount] = await Promise.all([
      this.getPrimaryAssignmentHeadcount(
        companyId,
        employeeScope,
        {
          ...(query.branch_id ? { branchId: query.branch_id } : {}),
          ...(query.department_id ? { departmentId: query.department_id } : {}),
        },
        'department',
      ),
      this.getPrimaryAssignmentHeadcount(
        companyId,
        employeeScope,
        {
          ...(query.branch_id ? { branchId: query.branch_id } : {}),
          ...(query.department_id ? { departmentId: query.department_id } : {}),
        },
        'branch',
      ),
    ]);

    const [
      companyHeadcount,
      joiners,
      completedExitTypes,
      attendanceSummary,
      employeesOnLeave,
      pendingLeaveApprovals,
      assignedOpenActionItems,
      approvedLeaveDaysByTypeResult,
      onboardingActive,
      onboardingOverdue,
      offboardingActive,
      offboardingPendingAccessTermination,
      performanceSummaryResult,
      workActivitySummaryResult,
      payrollSummaryResult,
      employeeFinanceSummaryResult,
      topPerformersResult,
      publishedAggregateSeriesResult,
      monthlyScoreDistributionResult,
      openingHeadcount,
      closingHeadcount,
    ] = await Promise.all([
      this.countActiveHeadcount(companyId, employeeScope),
      this.countByDateRange(
        companyId,
        employeeScope,
        'hire_date',
        period.dateFrom,
        period.dateTo,
      ),
      this.countCompletedExitsByType(
        companyId,
        employeeScope,
        period.dateFrom,
        period.dateTo,
      ),
      this.getAttendanceDiscipline(
        companyId,
        employeeScope,
        period.dateFrom,
        period.dateTo,
      ),
      this.countEmployeesOnLeave(companyId, employeeScope, period.today),
      this.countPendingLeaveApprovals(companyId, employeeScope),
      actor.companyMembershipId
        ? this.actionItemsService.countOpen(
            companyId,
            actor.companyMembershipId,
          )
        : Promise.resolve(null),
      isolateDashboardSource(
        'APPROVED_LEAVE_DAY_TREND',
        this.dashboardLeaveService.getApprovedLeaveDaysByType(
          companyId,
          employeeScope,
          period.dateFrom,
          period.dateTo,
        ),
        {
          available: false,
          reason: 'SOURCE_ERROR',
          unallocated_approved_requests: 0,
          items: [],
        },
      ),
      this.countOnboardingActive(companyId, employeeScope),
      this.countOnboardingOverdue(companyId, employeeScope, period.today),
      this.countOffboardingActive(companyId, employeeScope),
      this.countOffboardingPendingAccessTermination(companyId, employeeScope),
      isolateDashboardSource(
        'PERFORMANCE_SUMMARY',
        canReadPerformanceAggregates
          ? this.performanceInsightsService.getCompanySummary(
              actor,
              dashboardFilters,
            )
          : Promise.resolve(null),
        null,
      ),
      isolateDashboardSource(
        'WORK_ACTIVITY',
        this.workActivityInsightsService.getCompanySummary(
          actor,
          period.dateFrom,
          period.dateTo,
          dashboardFilters,
        ),
        null,
      ),
      isolateDashboardSource(
        'PAYROLL',
        payrollAccess.allowed
          ? this.payrollReportsService.dashboard(actor)
          : Promise.resolve(null),
        null,
      ),
      isolateDashboardSource(
        'EMPLOYEE_FINANCE',
        employeeFinanceAccess.allowed
          ? this.employeeFinanceReportsService.dashboard(actor)
          : Promise.resolve(null),
        null,
      ),
      isolateDashboardSource(
        'TOP_PERFORMERS',
        canReadPerformanceAggregates
          ? this.performanceInsightsService.getTopPerformers(
              actor,
              5,
              period.dateFrom,
              period.dateTo,
              dashboardFilters,
            )
          : Promise.resolve(null),
        null,
      ),
      isolateDashboardSource(
        'PERFORMANCE_TRENDS',
        canReadPerformanceAggregates
          ? this.performanceInsightsService.getPublishedAggregateSeries(
              actor,
              period.dateFrom,
              period.dateTo,
              dashboardFilters,
            )
          : Promise.resolve(null),
        null,
      ),
      isolateDashboardSource(
        'PERFORMANCE_SCORES',
        canReadPerformanceAggregates
          ? this.performanceInsightsService.getPublishedMonthlyScoreDistribution(
              actor,
              period.dateFrom,
              period.dateTo,
              dashboardFilters,
            )
          : Promise.resolve(null),
        null,
      ),
      this.countActiveOnDate(companyId, employeeScope, period.dateFrom),
      this.countActiveOnDate(companyId, employeeScope, period.dateTo),
    ]);

    const approvedLeaveDaysByType = approvedLeaveDaysByTypeResult.value;
    const performanceSummary = performanceSummaryResult.value;
    const workActivitySummary = workActivitySummaryResult.value;
    const payrollSummary = payrollSummaryResult.value;
    const employeeFinanceSummary = employeeFinanceSummaryResult.value;
    const topPerformers = topPerformersResult.value;
    const publishedAggregateSeries = publishedAggregateSeriesResult.value;
    const monthlyScoreDistribution = monthlyScoreDistributionResult.value;
    const partialErrors = [
      approvedLeaveDaysByTypeResult.unavailableWidget,
      performanceSummaryResult.unavailableWidget,
      workActivitySummaryResult.unavailableWidget,
      payrollSummaryResult.unavailableWidget,
      employeeFinanceSummaryResult.unavailableWidget,
      topPerformersResult.unavailableWidget,
      publishedAggregateSeriesResult.unavailableWidget,
      monthlyScoreDistributionResult.unavailableWidget,
    ].flatMap((widget) => (widget ? [widget] : []));
    const partialErrorCodes = new Set(
      partialErrors.map((widget) => widget.code),
    );

    const exits = Object.values(completedExitTypes).reduce(
      (total, count) => total + count,
      0,
    );
    const averageBoundaryHeadcount = (openingHeadcount + closingHeadcount) / 2;
    const attritionRate =
      averageBoundaryHeadcount > 0
        ? Number(((exits / averageBoundaryHeadcount) * 100).toFixed(2))
        : null;

    return {
      contract_version: 1,
      generated_at: new Date().toISOString(),
      period,
      filters: {
        branch_id: query.branch_id ?? null,
        department_id: query.department_id ?? null,
        employee_id: query.employee_id ?? null,
      },
      workforce: {
        company_headcount: companyHeadcount,
        joiners,
        exits,
        resignations: completedExitTypes[OffboardingTypeEnum.RESIGNATION] ?? 0,
        completed_exits_by_type: completedExitTypes,
        attrition_rate: attritionRate,
        attrition_numerator_completed_exits: exits,
        attrition_opening_headcount: openingHeadcount,
        attrition_closing_headcount: closingHeadcount,
        attrition_average_headcount: averageBoundaryHeadcount,
        department_headcount: departmentHeadcount,
        branch_headcount: branchHeadcount,
      },
      attendance: attendanceSummary,
      leave: {
        employees_currently_on_leave: employeesOnLeave,
        pending_requests: pendingLeaveApprovals,
        approved_days_by_type: approvedLeaveDaysByType,
      },
      workflow_pipeline: {
        leave: pendingLeaveApprovals,
      },
      action_inbox:
        assignedOpenActionItems === null
          ? null
          : {
              assigned_open_items: assignedOpenActionItems,
              population: 'SIGNED_IN_ASSIGNEE',
            },
      onboarding: {
        active_cases: onboardingActive,
        overdue_cases: onboardingOverdue,
      },
      offboarding: {
        active_cases: offboardingActive,
        pending_access_terminations: offboardingPendingAccessTermination,
      },
      performance: performanceSummary,
      work_activities: workActivitySummary,
      top_performers: topPerformers,
      published_performance_aggregates: publishedAggregateSeries,
      monthly_score_distribution: monthlyScoreDistribution,
      payroll: payrollSummary,
      employee_finance: employeeFinanceSummary,
      unavailable_widgets: [
        ...partialErrors,
        ...(!approvedLeaveDaysByType.available &&
        !partialErrorCodes.has('APPROVED_LEAVE_DAY_TREND')
          ? [
              {
                code: 'APPROVED_LEAVE_DAY_TREND',
                available: false,
                reason: approvedLeaveDaysByType.reason,
              },
            ]
          : []),
        ...(!payrollAccess.allowed
          ? [
              {
                code: 'PAYROLL',
                available: false,
                reason: payrollAccess.reason,
              },
            ]
          : []),
        ...(!employeeFinanceAccess.allowed
          ? [
              {
                code: 'EMPLOYEE_FINANCE',
                available: false,
                reason: employeeFinanceAccess.reason,
              },
            ]
          : []),
        ...(attendanceSummary.scheduled_employee_days === 0
          ? [
              {
                code: 'ABSENTEEISM_RATE',
                available: false,
                reason: 'NO_SCHEDULED_EMPLOYEE_DAY_DATA',
              },
            ]
          : []),
        ...(canReadPerformanceAggregates
          ? []
          : [
              {
                code: 'PERFORMANCE_TRENDS',
                available: false,
                reason: 'INSUFFICIENT_PERMISSION',
              },
              {
                code: 'PERFORMANCE_SCORES',
                available: false,
                reason: 'INSUFFICIENT_PERMISSION',
              },
            ]),
        {
          code: 'EMPLOYEE_LEVEL_FIELD_PRODUCTIVITY',
          available: false,
          reason: 'EMPLOYEE_LEVEL_AGGREGATE_NOT_CONFIGURED',
        },
        {
          code: 'CRM_COMMERCIAL_OUTCOMES',
          available: false,
          reason: 'AUTHORITATIVE_EXTERNAL_SOURCE_UNAVAILABLE',
        },
      ].map((widget) => ({
        ...widget,
        state: 'state' in widget ? widget.state : 'UNAVAILABLE',
      })),
      partial_errors: partialErrors,
    };
  }

  private async getPrimaryAssignmentHeadcount(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    filters: { branchId?: number; departmentId?: number },
    dimension: 'branch' | 'department',
  ) {
    const isBranch = dimension === 'branch';
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoin(
        isBranch ? 'employee.primary_branch' : 'employee.primary_department',
        'assignment',
      )
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('employee.employment_status = :activeStatus', {
        activeStatus: EmploymentStatusEnum.ACTIVE,
      });

    query
      .andWhere(`employee.id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    if (filters.branchId) {
      query.andWhere('employee.primary_branch_id = :branchId', {
        branchId: filters.branchId,
      });
    }
    if (filters.departmentId) {
      query.andWhere('employee.primary_department_id = :departmentId', {
        departmentId: filters.departmentId,
      });
    }

    const rows = await query
      .select('assignment.id', `${dimension}_id`)
      .addSelect('assignment.name', `${dimension}_name`)
      .addSelect('COUNT(DISTINCT employee.id)', 'headcount')
      .groupBy('assignment.id')
      .addGroupBy('assignment.name')
      .orderBy('assignment.name', 'ASC', 'NULLS LAST')
      .getRawMany<{
        [key: string]: string | number | null;
      }>();

    return rows.map((row) => ({
      [`${dimension}_id`]:
        row[`${dimension}_id`] === null ? null : Number(row[`${dimension}_id`]),
      [`${dimension}_name`]: row[`${dimension}_name`] ?? 'Unassigned',
      headcount: Number(row.headcount ?? 0),
    }));
  }

  private async countActiveHeadcount(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
  ): Promise<number> {
    return this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('employee.employment_status = :status', {
        status: EmploymentStatusEnum.ACTIVE,
      })
      .andWhere(`employee.id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params)
      .getCount();
  }

  private async countByDateRange(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    column: 'hire_date' | 'exit_date',
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', { companyId });
    query
      .andWhere(`employee.id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    return query
      .andWhere(`employee.${column} >= :dateFrom`, { dateFrom })
      .andWhere(`employee.${column} <= :dateTo`, { dateTo })
      .getCount();
  }

  private async countActiveOnDate(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    asOfDate: string,
  ): Promise<number> {
    const query = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', { companyId })
      .andWhere('employee.hire_date IS NOT NULL')
      .andWhere('employee.hire_date <= :asOfDate', { asOfDate });
    query.andWhere(`employee.id IN (${employeeScope.sql})`);
    return query
      .andWhere(
        '(employee.exit_date IS NULL OR employee.exit_date >= :asOfDate)',
        {
          asOfDate,
        },
      )
      .setParameters(employeeScope.params)
      .getCount();
  }

  private async countCompletedExitsByType(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    dateFrom: string,
    dateTo: string,
  ): Promise<Record<string, number>> {
    const query = this.offboardingRequestRepository
      .createQueryBuilder('request')
      .select('request.offboarding_type', 'exit_type')
      .addSelect('COUNT(request.id)', 'exit_count')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.status = :status', {
        status: OffboardingRequestStatusEnum.COMPLETED,
      });
    query
      .andWhere(`request.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    const rows = await query
      .andWhere('request.last_working_date >= :dateFrom', { dateFrom })
      .andWhere('request.last_working_date <= :dateTo', { dateTo })
      .groupBy('request.offboarding_type')
      .getRawMany<{ exit_type: string; exit_count: string }>();

    return Object.fromEntries(
      rows.map((row) => [row.exit_type, Number(row.exit_count)]),
    );
  }

  private async getAttendanceDiscipline(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    dateFrom: string,
    dateTo: string,
  ) {
    const excludedScheduledStatuses = [
      AttendanceDailyStatusEnum.OFF_DAY,
      AttendanceDailyStatusEnum.OFF_DAY_PRESENT,
      AttendanceDailyStatusEnum.HOLIDAY,
      AttendanceDailyStatusEnum.NO_SHIFT_SCHEDULE,
      AttendanceDailyStatusEnum.LEAVE,
      AttendanceDailyStatusEnum.SICK_LEAVE,
      AttendanceDailyStatusEnum.ANNUAL_LEAVE,
      AttendanceDailyStatusEnum.UNPAID_LEAVE,
    ];
    const approvedLeaveForDay = `NOT EXISTS (
      SELECT 1 FROM leave_requests approved_leave
      WHERE approved_leave.company_id = summary.company_id
        AND approved_leave.employee_id = summary.employee_id
        AND approved_leave.status = :approvedLeaveStatus
        AND approved_leave.start_date <= summary.attendance_date
        AND approved_leave.end_date >= summary.attendance_date
    )`;
    const query = this.attendanceDailySummaryRepository
      .createQueryBuilder('summary')
      .select('COUNT(*)', 'total_records')
      .addSelect(
        `SUM(CASE WHEN summary.late_minutes > 0 THEN 1 ELSE 0 END)`,
        'late',
      )
      .addSelect(
        `SUM(CASE WHEN summary.attendance_status = 'ABSENT' THEN 1 ELSE 0 END)`,
        'absent',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE summary.attendance_status NOT IN (:...excludedScheduledStatuses)
            AND ${approvedLeaveForDay}
        )`,
        'scheduled_employee_days',
      )
      .addSelect(
        `COUNT(*) FILTER (
          WHERE summary.attendance_status = :absentStatus
            AND ${approvedLeaveForDay}
        )`,
        'scheduled_absent_days',
      )
      .where('summary.companyId = :companyId', { companyId })
      .andWhere('summary.attendanceDate >= :dateFrom', { dateFrom })
      .andWhere('summary.attendanceDate <= :dateTo', { dateTo });
    query
      .andWhere(`summary.employeeId IN (${employeeScope.sql})`)
      .setParameters({
        ...employeeScope.params,
        excludedScheduledStatuses,
        absentStatus: AttendanceDailyStatusEnum.ABSENT,
        approvedLeaveStatus: LeaveStatusEnum.APPROVED,
      });
    const result = await query.getRawOne<Record<string, string>>();
    const scheduledEmployeeDays = Number(result?.scheduled_employee_days ?? 0);
    const scheduledAbsentDays = Number(result?.scheduled_absent_days ?? 0);

    return {
      total_records: Number(result?.total_records ?? 0),
      late: Number(result?.late ?? 0),
      absent: Number(result?.absent ?? 0),
      scheduled_employee_days: scheduledEmployeeDays,
      scheduled_absent_days: scheduledAbsentDays,
      absenteeism_rate:
        scheduledEmployeeDays > 0
          ? Number(
              ((scheduledAbsentDays / scheduledEmployeeDays) * 100).toFixed(2),
            )
          : null,
    };
  }

  private async countEmployeesOnLeave(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    today: string,
  ): Promise<number> {
    const query = this.leaveRequestRepository
      .createQueryBuilder('leave')
      .where('leave.company_id = :companyId', { companyId })
      .andWhere('leave.status = :status', { status: LeaveStatusEnum.APPROVED })
      .andWhere('leave.start_date <= :today', { today })
      .andWhere('leave.end_date >= :today', { today });
    query
      .andWhere(`leave.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    return query.getCount();
  }

  private async countPendingLeaveApprovals(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
  ): Promise<number> {
    const query = this.leaveRequestRepository
      .createQueryBuilder('leave')
      .where('leave.company_id = :companyId', { companyId })
      .andWhere('leave.status IN (:...statuses)', {
        statuses: [
          LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
          LeaveStatusEnum.PENDING_HR,
          LeaveStatusEnum.IN_REVIEW,
        ],
      })
      .andWhere(`leave.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    return query.getCount();
  }

  private async countOnboardingActive(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
  ): Promise<number> {
    return this.onboardingRequestRepository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.status NOT IN (:...closed)', {
        closed: CLOSED_ONBOARDING_STATUSES,
      })
      .andWhere(`request.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params)
      .getCount();
  }

  private async countOnboardingOverdue(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    today: string,
  ): Promise<number> {
    const query = this.onboardingRequestRepository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.status NOT IN (:...closed)', {
        closed: CLOSED_ONBOARDING_STATUSES,
      })
      .andWhere('request.planned_completion_date IS NOT NULL')
      .andWhere('request.planned_completion_date < :today', { today });
    query
      .andWhere(`request.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params);
    return query.getCount();
  }

  private async countOffboardingActive(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
  ): Promise<number> {
    return this.offboardingRequestRepository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.status NOT IN (:...closed)', {
        closed: CLOSED_OFFBOARDING_STATUSES,
      })
      .andWhere(`request.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params)
      .getCount();
  }

  private async countOffboardingPendingAccessTermination(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
  ): Promise<number> {
    return this.offboardingRequestRepository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.status IN (:...statuses)', {
        statuses: [
          OffboardingRequestStatusEnum.READY_FOR_TERMINATION,
          OffboardingRequestStatusEnum.TERMINATION_SCHEDULED,
          OffboardingRequestStatusEnum.TERMINATING_ACCESS,
          OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED,
        ],
      })
      .andWhere(`request.employee_id IN (${employeeScope.sql})`)
      .setParameters(employeeScope.params)
      .getCount();
  }
}
