import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../shared/hr-access.service';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { LeaveStatusEnum } from '../leave/enums/leave-status.enum';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OnboardingRequestStatusEnum } from '../onboarding/enums/onboarding-request-status.enum';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { OffboardingRequestStatusEnum } from '../offboarding/enums/offboarding-request-status.enum';
import { PerformanceInsightsService } from '../performance/services/performance-insights.service';
import { WorkActivityInsightsService } from '../work-activities/services/work-activity-insights.service';
import { DashboardDateService } from './dashboard-date.service';
import { DashboardQueryDto } from './dtos/dashboard-query.dto';

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
  ) {}

  async getDashboard(actor: AuthenticatedUser, query: DashboardQueryDto) {
    const companyId = actor.companyId!;
    const period = this.dateService.resolve(query);

    const scoped = await this.hrAccessService.getAccessibleEmployeeIds(actor);
    const employeeIds =
      scoped ??
      (
        await this.employeeRepository
          .createQueryBuilder('employee')
          .where('employee.company_id = :companyId', { companyId })
          .select('employee.id', 'id')
          .getRawMany<{ id: number }>()
      ).map((row) => Number(row.id));

    const [
      companyHeadcount,
      joiners,
      exits,
      attendanceSummary,
      employeesOnLeave,
      onboardingActive,
      onboardingOverdue,
      offboardingActive,
      offboardingPendingAccessTermination,
      performanceSummary,
      workActivitySummary,
    ] = await Promise.all([
      employeeIds.length
        ? this.employeeRepository.count({
            where: {
              id: In(employeeIds),
              employment_status: EmploymentStatusEnum.ACTIVE,
            },
          })
        : 0,
      this.countByDateRange(
        employeeIds,
        'hire_date',
        period.dateFrom,
        period.dateTo,
      ),
      this.countByDateRange(
        employeeIds,
        'exit_date',
        period.dateFrom,
        period.dateTo,
      ),
      this.getAttendanceDiscipline(
        companyId,
        employeeIds,
        period.dateFrom,
        period.dateTo,
      ),
      this.countEmployeesOnLeave(companyId, employeeIds, period.today),
      this.countOnboardingActive(companyId, employeeIds),
      this.countOnboardingOverdue(companyId, employeeIds, period.today),
      this.countOffboardingActive(companyId, employeeIds),
      this.countOffboardingPendingAccessTermination(companyId, employeeIds),
      this.performanceInsightsService.getCompanySummary(actor),
      this.workActivityInsightsService.getCompanySummary(
        actor,
        period.dateFrom,
        period.dateTo,
      ),
    ]);

    const attritionRate =
      companyHeadcount > 0
        ? Number(((exits / companyHeadcount) * 100).toFixed(2))
        : 0;

    return {
      generated_at: new Date().toISOString(),
      period,
      workforce: {
        company_headcount: companyHeadcount,
        joiners,
        exits,
        attrition_rate: attritionRate,
      },
      attendance: attendanceSummary,
      leave: {
        employees_currently_on_leave: employeesOnLeave,
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
      unavailable_widgets: [
        {
          code: 'PAYROLL_COST',
          available: false,
          reason: 'Payroll and compensation are not implemented.',
        },
        {
          code: 'STAFF_LOAN_OUTSTANDING',
          available: false,
          reason: 'Staff loan management is not implemented.',
        },
        {
          code: 'TOP_PERFORMERS',
          available: false,
          reason: 'Performance scoring is not implemented.',
        },
        {
          code: 'FIELD_PRODUCTIVITY',
          available: true,
        },
      ],
    };
  }

  private async countByDateRange(
    employeeIds: number[],
    column: 'hire_date' | 'exit_date',
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.id IN (:...employeeIds)', { employeeIds })
      .andWhere(`employee.${column} >= :dateFrom`, { dateFrom })
      .andWhere(`employee.${column} <= :dateTo`, { dateTo })
      .getCount();
  }

  private async getAttendanceDiscipline(
    companyId: number,
    employeeIds: number[],
    dateFrom: string,
    dateTo: string,
  ) {
    if (!employeeIds.length) {
      return { total_records: 0, late: 0, absent: 0 };
    }

    const result = await this.attendanceDailySummaryRepository
      .createQueryBuilder('summary')
      .select('COUNT(*)', 'total_records')
      .addSelect(
        `SUM(CASE WHEN summary.lateMinutes > 0 THEN 1 ELSE 0 END)`,
        'late',
      )
      .addSelect(
        `SUM(CASE WHEN summary.attendanceStatus = 'ABSENT' THEN 1 ELSE 0 END)`,
        'absent',
      )
      .where('summary.companyId = :companyId', { companyId })
      .andWhere('summary.employeeId IN (:...employeeIds)', { employeeIds })
      .andWhere('summary.attendanceDate >= :dateFrom', { dateFrom })
      .andWhere('summary.attendanceDate <= :dateTo', { dateTo })
      .getRawOne<Record<string, string>>();

    return {
      total_records: Number(result?.total_records ?? 0),
      late: Number(result?.late ?? 0),
      absent: Number(result?.absent ?? 0),
    };
  }

  private async countEmployeesOnLeave(
    companyId: number,
    employeeIds: number[],
    today: string,
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.leaveRequestRepository
      .createQueryBuilder('leave')
      .where('leave.company_id = :companyId', { companyId })
      .andWhere('leave.employee_id IN (:...employeeIds)', { employeeIds })
      .andWhere('leave.status = :status', { status: LeaveStatusEnum.APPROVED })
      .andWhere('leave.start_date <= :today', { today })
      .andWhere('leave.end_date >= :today', { today })
      .getCount();
  }

  private async countOnboardingActive(
    companyId: number,
    employeeIds: number[],
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.onboardingRequestRepository.count({
      where: {
        company_id: companyId,
        employee_id: In(employeeIds),
        status: In(
          Object.values(OnboardingRequestStatusEnum).filter(
            (status) => !CLOSED_ONBOARDING_STATUSES.includes(status),
          ),
        ),
      },
    });
  }

  private async countOnboardingOverdue(
    companyId: number,
    employeeIds: number[],
    today: string,
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.onboardingRequestRepository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.employee_id IN (:...employeeIds)', { employeeIds })
      .andWhere('request.status NOT IN (:...closed)', {
        closed: CLOSED_ONBOARDING_STATUSES,
      })
      .andWhere('request.planned_completion_date IS NOT NULL')
      .andWhere('request.planned_completion_date < :today', { today })
      .getCount();
  }

  private async countOffboardingActive(
    companyId: number,
    employeeIds: number[],
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.offboardingRequestRepository.count({
      where: {
        company_id: companyId,
        employee_id: In(employeeIds),
        status: In(
          Object.values(OffboardingRequestStatusEnum).filter(
            (status) => !CLOSED_OFFBOARDING_STATUSES.includes(status),
          ),
        ),
      },
    });
  }

  private async countOffboardingPendingAccessTermination(
    companyId: number,
    employeeIds: number[],
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.offboardingRequestRepository.count({
      where: {
        company_id: companyId,
        employee_id: In(employeeIds),
        status: In([
          OffboardingRequestStatusEnum.READY_FOR_TERMINATION,
          OffboardingRequestStatusEnum.TERMINATION_SCHEDULED,
          OffboardingRequestStatusEnum.TERMINATING_ACCESS,
          OffboardingRequestStatusEnum.ACCESS_TERMINATION_FAILED,
        ]),
      },
    });
  }
}
