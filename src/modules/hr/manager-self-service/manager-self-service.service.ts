import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    private readonly actionItemsService: ActionItemsService,
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
        full_name: [employee.first_name, employee.middle_name, employee.last_name]
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
    query: { page?: number; limit?: number; date_from?: string; date_to?: string },
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
      qb.andWhere('s.attendanceDate >= :dateFrom', { dateFrom: query.date_from });
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

  async getDashboard(actor: AuthenticatedUser, query: ManagerDashboardQueryDto) {
    const companyId = this.ensureCompanyId(actor);
    const today = new Date().toISOString().slice(0, 10);
    const dateTo = query.date_to ?? today;
    const dateFrom = query.date_from ?? today;

    const scopedEmployeeIds = await this.resolveScopedEmployeeIds(actor);
    const hasNoAccess = scopedEmployeeIds !== null && scopedEmployeeIds.length === 0;

    const teamEmployeeIds = hasNoAccess
      ? []
      : scopedEmployeeIds ??
        (
          await this.employeeRepository
            .createQueryBuilder('employee')
            .where('employee.company_id = :companyId', { companyId })
            .select('employee.id', 'id')
            .getRawMany<{ id: number }>()
        ).map((row) => Number(row.id));

    const [openActions, attendanceSummary, employeesOnLeave, pendingCorrections] =
      await Promise.all([
        this.actionItemsService.countOpen(
          companyId,
          actor.companyMembershipId!,
        ),
        this.getTeamAttendanceSummary(companyId, teamEmployeeIds, dateFrom, dateTo),
        this.countEmployeesOnLeave(companyId, teamEmployeeIds, today),
        this.countPendingCorrections(companyId, teamEmployeeIds),
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
      capabilities: {
        activity_review: {
          available: false,
          reason: 'Daily activity management is not implemented.',
        },
        kpi_review: {
          available: false,
          reason: 'KPI and performance management is not implemented.',
        },
        probation_recommendation: {
          available: false,
          reason: 'Probation and confirmation workflow is not implemented.',
        },
      },
    };
  }

  private async getTeamAttendanceSummary(
    companyId: number,
    employeeIds: number[],
    dateFrom: string,
    dateTo: string,
  ) {
    if (!employeeIds.length) {
      return { total_records: 0, present: 0, absent: 0, late: 0, early_departure: 0 };
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
