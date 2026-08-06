import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../shared/hr-access.service';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { EmployeeConfirmationStatusEnum } from '../employees/enums/employee-confirmation-status.enum';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { LeaveStatusEnum } from '../leave/enums/leave-status.enum';
import { Document } from '../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OnboardingRequestStatusEnum } from '../onboarding/enums/onboarding-request-status.enum';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { OffboardingRequestStatusEnum } from '../offboarding/enums/offboarding-request-status.enum';
import { WorkActivityInsightsService } from '../work-activities/services/work-activity-insights.service';
import { PayrollReportsService } from '../payroll/services/payroll-core.services';
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
export class HrDashboardService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly dateService: DashboardDateService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDailySummary)
    private readonly attendanceDailySummaryRepository: Repository<AttendanceDailySummary>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(OnboardingRequest)
    private readonly onboardingRequestRepository: Repository<OnboardingRequest>,
    @InjectRepository(OffboardingRequest)
    private readonly offboardingRequestRepository: Repository<OffboardingRequest>,
    private readonly workActivityInsightsService: WorkActivityInsightsService,
    private readonly payrollReportsService: PayrollReportsService,
  ) {}

  private async resolveScopedEmployeeIds(
    actor: AuthenticatedUser,
    companyId: number,
    query: DashboardQueryDto,
  ): Promise<number[] | null> {
    const scoped = await this.hrAccessService.getAccessibleEmployeeIds(actor);

    if (!query.branch_id && !query.department_id) {
      return scoped;
    }

    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.company_id = :companyId', { companyId })
      .select('employee.id', 'id');

    if (scoped !== null) {
      if (!scoped.length) {
        return [];
      }
      qb.andWhere('employee.id IN (:...scoped)', { scoped });
    }

    if (query.branch_id) {
      qb.andWhere('employee.primary_branch_id = :branchId', {
        branchId: query.branch_id,
      });
    }
    if (query.department_id) {
      qb.andWhere('employee.primary_department_id = :departmentId', {
        departmentId: query.department_id,
      });
    }

    const rows = await qb.getRawMany<{ id: number }>();
    return rows.map((row) => Number(row.id));
  }

  async getDashboard(actor: AuthenticatedUser, query: DashboardQueryDto) {
    const companyId = actor.companyId!;
    const period = this.dateService.resolve(query);
    const employeeIds = await this.resolveScopedEmployeeIds(
      actor,
      companyId,
      query,
    );
    const scopedIds =
      employeeIds ??
      (
        await this.employeeRepository
          .createQueryBuilder('employee')
          .where('employee.company_id = :companyId', { companyId })
          .select('employee.id', 'id')
          .getRawMany<{ id: number }>()
      ).map((row) => Number(row.id));

    const [
      headcount,
      joiners,
      exits,
      probation,
      confirmationDue,
      attendance,
      employeesOnLeave,
      pendingLeaveApprovals,
      onboardingActive,
      offboardingActive,
      documentCompliance,
      manpower,
      workActivitySummary,
      payrollSummary,
    ] = await Promise.all([
      this.countByStatus(scopedIds, EmploymentStatusEnum.ACTIVE),
      this.countJoiners(scopedIds, period.dateFrom, period.dateTo),
      this.countExits(scopedIds, period.dateFrom, period.dateTo),
      this.countByConfirmationStatus(
        scopedIds,
        EmployeeConfirmationStatusEnum.PROBATION,
      ),
      this.countConfirmationDue(scopedIds, period.today),
      this.getAttendanceSummary(
        companyId,
        scopedIds,
        period.dateFrom,
        period.dateTo,
      ),
      this.countEmployeesOnLeave(companyId, scopedIds, period.today),
      this.countPendingLeaveApprovals(companyId, scopedIds),
      this.countOnboardingActive(companyId, scopedIds),
      this.countOffboardingActive(companyId, scopedIds),
      this.getDocumentCompliance(companyId, scopedIds),
      this.getManpowerDistribution(scopedIds),
      this.workActivityInsightsService.getCompanySummary(
        actor,
        period.dateFrom,
        period.dateTo,
      ),
      this.payrollReportsService.dashboard(actor),
    ]);

    return {
      generated_at: new Date().toISOString(),
      period,
      filters: {
        branch_id: query.branch_id ?? null,
        department_id: query.department_id ?? null,
      },
      headcount,
      movements: { new_joiners: joiners, exits },
      probation: {
        employees_on_probation: probation,
        confirmation_due: confirmationDue,
      },
      attendance,
      leave: {
        employees_currently_on_leave: employeesOnLeave,
        pending_approvals: pendingLeaveApprovals,
      },
      pending_approvals: {
        leave: pendingLeaveApprovals,
        onboarding_active: onboardingActive,
        offboarding_active: offboardingActive,
      },
      employee_document_compliance: documentCompliance,
      manpower,
      work_activities: workActivitySummary,
      payroll: payrollSummary,
      unavailable_widgets: [],
    };
  }

  private async countByStatus(
    employeeIds: number[],
    status: EmploymentStatusEnum,
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.employeeRepository.count({
      where: { id: In(employeeIds), employment_status: status },
    });
  }

  private async countByConfirmationStatus(
    employeeIds: number[],
    status: EmployeeConfirmationStatusEnum,
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.employeeRepository.count({
      where: { id: In(employeeIds), confirmation_status: status },
    });
  }

  private async countJoiners(
    employeeIds: number[],
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.id IN (:...employeeIds)', { employeeIds })
      .andWhere('employee.hire_date >= :dateFrom', { dateFrom })
      .andWhere('employee.hire_date <= :dateTo', { dateTo })
      .getCount();
  }

  private async countExits(
    employeeIds: number[],
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.id IN (:...employeeIds)', { employeeIds })
      .andWhere('employee.exit_date >= :dateFrom', { dateFrom })
      .andWhere('employee.exit_date <= :dateTo', { dateTo })
      .getCount();
  }

  private async countConfirmationDue(
    employeeIds: number[],
    today: string,
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.id IN (:...employeeIds)', { employeeIds })
      .andWhere('employee.confirmation_due_date <= :today', { today })
      .andWhere('employee.confirmation_status != :confirmed', {
        confirmed: EmployeeConfirmationStatusEnum.CONFIRMED,
      })
      .getCount();
  }

  private async getAttendanceSummary(
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
      .getRawOne<Record<string, string>>();

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

  private async countPendingLeaveApprovals(
    companyId: number,
    employeeIds: number[],
  ): Promise<number> {
    if (!employeeIds.length) return 0;
    return this.leaveRequestRepository
      .createQueryBuilder('leave')
      .where('leave.company_id = :companyId', { companyId })
      .andWhere('leave.employee_id IN (:...employeeIds)', { employeeIds })
      .andWhere('leave.status IN (:...statuses)', {
        statuses: [
          LeaveStatusEnum.PENDING_DEPARTMENT_MANAGER,
          LeaveStatusEnum.PENDING_HR,
        ],
      })
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

  private async getDocumentCompliance(
    companyId: number,
    employeeIds: number[],
  ) {
    if (!employeeIds.length) {
      return {
        total_documents: 0,
        verified_documents: 0,
        pending_verification: 0,
      };
    }

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.EMPLOYEE,
        entity_id: In(employeeIds),
      },
    });

    return {
      total_documents: documents.length,
      verified_documents: documents.filter((d) => d.is_verified).length,
      pending_verification: documents.filter((d) => !d.is_verified).length,
    };
  }

  private async getManpowerDistribution(employeeIds: number[]) {
    if (!employeeIds.length) {
      return [];
    }

    const rows = await this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoin('employee.primary_department', 'department')
      .where('employee.id IN (:...employeeIds)', { employeeIds })
      .select('department.id', 'department_id')
      .addSelect('department.name', 'department_name')
      .addSelect('COUNT(*)', 'headcount')
      .groupBy('department.id')
      .addGroupBy('department.name')
      .getRawMany<{
        department_id: number | null;
        department_name: string | null;
        headcount: string;
      }>();

    return rows.map((row) => ({
      department_id: row.department_id,
      department_name: row.department_name ?? 'Unassigned',
      headcount: Number(row.headcount),
    }));
  }
}
