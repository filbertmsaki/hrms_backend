import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ManagerSelfServiceService } from './manager-self-service.service';
import { HrAccessService } from '../shared/hr-access.service';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { AttendanceCorrectionRequest } from '../self-service/entities/attendance-correction-request.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { ActionItemsService } from '../action-inbox/action-items.service';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { PerformanceInsightsService } from '../performance/services/performance-insights.service';
import { WorkActivityInsightsService } from '../work-activities/services/work-activity-insights.service';
import { ProbationCase } from '../probation/entities/probation-case.entity';
import { DashboardDateService } from '../dashboards/dashboard-date.service';
import { ProbationCaseStatusEnum } from '../probation/enums/probation-case-status.enum';
import {
  DailyActivityEntry,
  DailyActivityReport,
} from '../work-activities/entities/daily-activity.entities';

describe('ManagerSelfServiceService', () => {
  let service: ManagerSelfServiceService;
  let hrAccessService: {
    getAccessibleEmployeeIds: jest.Mock;
    getAccessibleEmployeeSqlScope: jest.Mock;
  };
  let employeeRepository: { createQueryBuilder: jest.Mock };
  let attendanceDailySummaryRepository: { createQueryBuilder: jest.Mock };
  let correctionRequestRepository: { createQueryBuilder: jest.Mock };
  let leaveRequestRepository: { createQueryBuilder: jest.Mock };
  let probationCaseRepository: { count: jest.Mock };
  let activityReportRepository: { find: jest.Mock };
  let activityEntryRepository: { find: jest.Mock };
  let actionItemsService: { countOpen: jest.Mock };
  let performanceInsightsService: { getManagerSummary: jest.Mock };
  let workActivityInsightsService: { getManagerSummary: jest.Mock };

  const actor: AuthenticatedUser = {
    id: 1,
    email: 'manager@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 20,
    employeeId: 30,
    roles: [],
    permissions: [],
  };

  const buildQueryBuilder = (result: unknown[]) => {
    const qb: Record<string, jest.Mock> = {
      leftJoinAndSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      setParameters: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getManyAndCount: jest.fn().mockResolvedValue([result, result.length]),
    };
    for (const key of [
      'leftJoinAndSelect',
      'where',
      'andWhere',
      'setParameters',
      'orderBy',
      'addOrderBy',
      'skip',
      'take',
    ]) {
      qb[key].mockReturnValue(qb);
    }
    return qb;
  };

  const buildCountQueryBuilder = (count = 0) => {
    const qb: Record<string, jest.Mock> = {
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      setParameters: jest.fn(),
      getCount: jest.fn().mockResolvedValue(count),
      getRawOne: jest.fn().mockResolvedValue({
        total_records: '0',
        present: '0',
        absent: '0',
        late: '0',
        early_departure: '0',
      }),
    };
    for (const key of [
      'select',
      'addSelect',
      'where',
      'andWhere',
      'setParameters',
    ]) {
      qb[key].mockReturnValue(qb);
    }
    return qb;
  };

  beforeEach(() => {
    hrAccessService = {
      getAccessibleEmployeeIds: jest.fn(),
      getAccessibleEmployeeSqlScope: jest.fn().mockResolvedValue({
        companyWide: true,
        actorEmployeeId: null,
        branchIds: [],
        departmentIds: [],
        managerEmployeeId: null,
      }),
      getAccessibleEmployeeSqlScope: jest.fn().mockResolvedValue({
        companyWide: true,
        actorEmployeeId: null,
        branchIds: [],
        departmentIds: [],
        managerEmployeeId: null,
      }),
      assertCanAccessEmployee: jest.fn(
        async (_actor: AuthenticatedUser, employee: Employee) => {
          const accessible =
            await hrAccessService.getAccessibleEmployeeIds(_actor);
          if (accessible !== null && !accessible.includes(employee.id)) {
            throw new ForbiddenException(
              'You do not have access to the requested employee',
            );
          }
        },
      ),
    };
    employeeRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(buildQueryBuilder([])),
    };
    attendanceDailySummaryRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
    };
    correctionRequestRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
    };
    leaveRequestRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
    };
    probationCaseRepository = { count: jest.fn().mockResolvedValue(0) };
    activityReportRepository = { find: jest.fn().mockResolvedValue([]) };
    activityEntryRepository = { find: jest.fn().mockResolvedValue([]) };
    actionItemsService = { countOpen: jest.fn().mockResolvedValue(0) };
    performanceInsightsService = {
      getManagerSummary: jest.fn().mockResolvedValue({
        pending_team_validations: 0,
        published_team_reviews: 0,
      }),
    };
    workActivityInsightsService = {
      getManagerSummary: jest.fn().mockResolvedValue({
        pending_activity_reviews: 0,
      }),
    };

    service = new ManagerSelfServiceService(
      hrAccessService as unknown as HrAccessService,
      employeeRepository as unknown as Repository<Employee>,
      attendanceDailySummaryRepository as unknown as Repository<AttendanceDailySummary>,
      correctionRequestRepository as unknown as Repository<AttendanceCorrectionRequest>,
      leaveRequestRepository as unknown as Repository<LeaveRequest>,
      probationCaseRepository as unknown as Repository<ProbationCase>,
      activityReportRepository as unknown as Repository<DailyActivityReport>,
      activityEntryRepository as unknown as Repository<DailyActivityEntry>,
      actionItemsService as unknown as ActionItemsService,
      performanceInsightsService as unknown as PerformanceInsightsService,
      workActivityInsightsService as unknown as WorkActivityInsightsService,
      {
        resolve: jest.fn().mockResolvedValue({
          dateFrom: '2026-10-01',
          dateTo: '2026-10-28',
          today: '2026-10-28',
          timezone: 'Africa/Dar_es_Salaam',
        }),
      } as unknown as DashboardDateService,
    );
  });

  it('rejects a caller with no employee profile', async () => {
    await expect(
      service.getTeamMembers({ ...actor, employeeId: undefined }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes the team query to the compact employee scope returned by HrAccessService', async () => {
    hrAccessService.getAccessibleEmployeeSqlScope.mockResolvedValue({
      companyWide: false,
      actorEmployeeId: null,
      branchIds: [],
      departmentIds: [],
      managerEmployeeId: 30,
    });
    const qb = buildQueryBuilder([]);
    employeeRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getTeamMembers(actor, {});

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('employee.id IN (SELECT employee_scope.id'),
    );
    expect(qb.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeCompanyId: 10,
        scopeManagerEmployeeId: 30,
      }),
    );
  });

  it('applies direct-report filtering inside the authorized scope', async () => {
    hrAccessService.getAccessibleEmployeeSqlScope.mockResolvedValue({
      companyWide: false,
      actorEmployeeId: null,
      branchIds: [],
      departmentIds: [],
      managerEmployeeId: 30,
    });
    const qb = buildQueryBuilder([]);
    employeeRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getTeamMembers(actor, { direct_reports_only: true });

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('employee.id IN (SELECT employee_scope.id'),
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'employee.reports_to = :managerEmployeeId',
      { managerEmployeeId: 30 },
    );
  });

  it('denies a team-member summary outside the manager accessible employee scope', async () => {
    hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([30, 31]);
    employeeRepository.findOne = jest.fn().mockResolvedValue({
      id: 99,
      company_id: 10,
      primary_branch_id: 4,
      department_assignments: [],
      primary_department: null,
      primary_position: null,
    });

    await expect(service.getTeamMemberSummary(actor, 99)).rejects.toThrow(
      'You do not have access to the requested employee',
    );
    expect(employeeRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99, company_id: 10 } }),
    );
  });

  it('constrains team attendance to company, accessible employees and requested dates', async () => {
    hrAccessService.getAccessibleEmployeeSqlScope.mockResolvedValue({
      companyWide: false,
      actorEmployeeId: null,
      branchIds: [],
      departmentIds: [],
      managerEmployeeId: 30,
    });
    const qb = buildQueryBuilder([]);
    attendanceDailySummaryRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getTeamAttendance(actor, {
      page: 2,
      limit: 5,
      date_from: '2026-09-01',
      date_to: '2026-09-30',
    });

    expect(qb.where).toHaveBeenCalledWith('s.companyId = :companyId', {
      companyId: 10,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('s.employeeId IN (SELECT employee_scope.id'),
    );
    expect(qb.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeCompanyId: 10,
        scopeManagerEmployeeId: 30,
      }),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('s.attendanceDate >= :dateFrom', {
      dateFrom: '2026-09-01',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('s.attendanceDate <= :dateTo', {
      dateTo: '2026-09-30',
    });
  });

  it('applies an empty SQL employee scope to team attendance without expanding IDs', async () => {
    hrAccessService.getAccessibleEmployeeSqlScope.mockResolvedValue({
      companyWide: false,
      actorEmployeeId: null,
      branchIds: [],
      departmentIds: [],
      managerEmployeeId: null,
    });
    const qb = buildQueryBuilder([]);
    attendanceDailySummaryRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getTeamAttendance(actor, {});

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('s.employeeId IN (SELECT employee_scope.id'),
    );
  });

  it('does not disclose a team-member summary across company boundaries', async () => {
    employeeRepository.findOne = jest.fn().mockResolvedValue(null);

    await expect(service.getTeamMemberSummary(actor, 99)).rejects.toThrow(
      'Employee not found',
    );
    expect(employeeRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99, company_id: 10 } }),
    );
    expect(hrAccessService.getAccessibleEmployeeIds).not.toHaveBeenCalled();
  });

  it('uses the company SQL scope for company-wide list queries', async () => {
    hrAccessService.getAccessibleEmployeeSqlScope.mockResolvedValue({
      companyWide: true,
      actorEmployeeId: null,
      branchIds: [],
      departmentIds: [],
      managerEmployeeId: null,
    });
    const qb = buildQueryBuilder([]);
    employeeRepository.createQueryBuilder.mockReturnValue(qb);

    await service.getTeamMembers(actor, {});

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('employee.id IN (SELECT employee_scope.id'),
    );
  });

  it('exposes probation recommendation capability from pending manager review cases', async () => {
    hrAccessService.getAccessibleEmployeeIds.mockResolvedValue([30, 31]);
    hrAccessService.getAccessibleEmployeeSqlScope.mockResolvedValue({
      companyWide: false,
      actorEmployeeId: null,
      branchIds: [],
      departmentIds: [],
      managerEmployeeId: 30,
    });
    const aggregateQuery = buildCountQueryBuilder(2);
    aggregateQuery.setParameters = jest.fn().mockReturnValue(aggregateQuery);
    employeeRepository.createQueryBuilder.mockReturnValue(aggregateQuery);
    attendanceDailySummaryRepository.createQueryBuilder.mockReturnValue(
      aggregateQuery,
    );
    leaveRequestRepository.createQueryBuilder.mockReturnValue(aggregateQuery);
    correctionRequestRepository.createQueryBuilder.mockReturnValue(
      aggregateQuery,
    );
    probationCaseRepository.count.mockResolvedValue(2);

    const result = await service.getDashboard(actor, {
      date_from: '2026-09-01',
      date_to: '2026-09-30',
    });

    expect(probationCaseRepository.count).toHaveBeenCalledWith({
      where: {
        companyId: 10,
        managerEmployeeId: 30,
        status: ProbationCaseStatusEnum.MANAGER_REVIEW_PENDING,
      },
    });
    expect(result.capabilities.probation_recommendation).toEqual({
      available: true,
      pending_recommendations: 2,
    });
  });

  it('builds a company-scoped weekly activity summary with full-period totals', async () => {
    hrAccessService.getAccessibleEmployeeSqlScope.mockResolvedValue({
      companyWide: false,
      actorEmployeeId: null,
      branchIds: [],
      departmentIds: [],
      managerEmployeeId: 30,
    });
    const employee = {
      id: 31,
      company_id: 10,
      employee_no: 'E-31',
      first_name: 'Employee',
      middle_name: null,
      last_name: 'One',
      hire_date: '2026-01-01',
      exit_date: null,
      employment_status: 'ACTIVE',
    };
    const employeeQb = {
      clone: jest
        .fn()
        .mockReturnValue({ getCount: jest.fn().mockResolvedValue(1) }),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([employee]),
    };
    const totalsQb: Record<string, jest.Mock> = {};
    for (const method of [
      'select',
      'addSelect',
      'where',
      'andWhere',
      'setParameters',
    ]) {
      totalsQb[method] = jest.fn().mockReturnThis();
    }
    totalsQb.getRawOne = jest.fn().mockResolvedValue({
      team_members: '1',
      eligible_days: '7',
      submitted_days: '1',
      late_reports: '1',
      approved_reports: '1',
      planned_activities: '1',
      completed_activities: '1',
      deferred_activities: '0',
    });
    employeeRepository.createQueryBuilder
      .mockReturnValueOnce(employeeQb)
      .mockReturnValueOnce(totalsQb);
    activityReportRepository.find.mockResolvedValue([
      {
        id: 8,
        companyId: 10,
        employeeId: 31,
        activityDate: '2026-10-27',
        status: 'APPROVED',
        submissionIsLate: true,
        submittedAt: new Date('2026-10-28T10:00:00Z'),
      },
    ]);
    activityEntryRepository.find.mockResolvedValue([
      { dailyActivityReportId: 8, status: 'COMPLETED' },
    ]);

    const result = await service.getActivitySummary(actor, {
      period_type: 'WEEKLY' as never,
      anchor_date: '2026-10-27',
    });

    expect(result.period).toEqual({
      period_type: 'WEEKLY',
      anchor_date: '2026-10-27',
      date_from: '2026-10-26',
      date_to: '2026-11-01',
      timezone: 'Africa/Dar_es_Salaam',
    });
    expect(result.pagination).toEqual({
      page: 1,
      limit: 25,
      total: 1,
      total_pages: 1,
    });
    expect(employeeQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('employee.id IN (SELECT employee_scope.id'),
    );
    expect(employeeQb.setParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeCompanyId: 10,
        scopeManagerEmployeeId: 30,
        excludedEmployeeId: 30,
      }),
    );
    expect(employeeQb.skip).toHaveBeenCalledWith(0);
    expect(employeeQb.take).toHaveBeenCalledWith(25);
    expect(totalsQb.getRawOne).toHaveBeenCalledTimes(1);
    expect(activityReportRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ id: true, submissionIsLate: true }),
      }),
    );
    expect(result.data[0]).toMatchObject({
      employee_id: 31,
      eligible_days: 7,
      submitted_days: 1,
      missing_days: 6,
      late_reports: 1,
      approved_reports: 1,
      planned_activities: 1,
      completed_activities: 1,
    });
    expect(result.totals).toMatchObject({
      team_members: 1,
      eligible_days: 7,
      missing_days: 6,
      planned_activities: 1,
      completed_activities: 1,
      completion_rate: 100,
    });
  });
});
