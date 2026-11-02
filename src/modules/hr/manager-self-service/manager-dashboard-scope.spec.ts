import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ManagerSelfServiceService } from './manager-self-service.service';
import { DashboardDateService } from '../dashboards/dashboard-date.service';

describe('ManagerSelfServiceService dashboard employee scope', () => {
  const actor: AuthenticatedUser = {
    id: 1,
    email: 'manager@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 20,
    employeeId: 30,
    roles: [],
    permissions: ['data_scope:team'],
  };

  it('aggregates manager dashboard populations with compact SQL scope', async () => {
    const queryBuilders: Array<Record<string, jest.Mock>> = [];
    const makeQueryBuilder = (
      rawResult: Record<string, string> = {
        total_records: '4',
        present: '3',
        absent: '1',
        late: '1',
        early_departure: '0',
      },
      count = 5,
    ) => {
      const query: Record<string, jest.Mock> = {};
      for (const method of [
        'select',
        'addSelect',
        'where',
        'andWhere',
        'setParameters',
      ]) {
        query[method] = jest.fn().mockReturnValue(query);
      }
      query.getCount = jest.fn().mockResolvedValue(count);
      query.getRawOne = jest.fn().mockResolvedValue(rawResult);
      queryBuilders.push(query);
      return query;
    };

    const employeeQuery = makeQueryBuilder({}, 6);
    const attendanceQuery = makeQueryBuilder();
    const leaveQuery = makeQueryBuilder({}, 2);
    const correctionQuery = makeQueryBuilder({}, 1);
    const hrAccessService = {
      getAccessibleEmployeeSqlScope: jest.fn().mockResolvedValue({
        companyWide: false,
        actorEmployeeId: null,
        branchIds: [],
        departmentIds: [],
        managerEmployeeId: 30,
      }),
      getAccessibleEmployeeIds: jest.fn(),
    };
    const service = Object.assign(
      Object.create(ManagerSelfServiceService.prototype),
      {
        hrAccessService,
        employeeRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(employeeQuery),
        },
        attendanceDailySummaryRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(attendanceQuery),
        },
        leaveRequestRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(leaveQuery),
        },
        correctionRequestRepository: {
          createQueryBuilder: jest.fn().mockReturnValue(correctionQuery),
        },
        actionItemsService: { countOpen: jest.fn().mockResolvedValue(3) },
        performanceInsightsService: {
          getManagerSummary: jest.fn().mockResolvedValue({
            pending_team_validations: 2,
            published_team_reviews: 4,
          }),
        },
        workActivityInsightsService: {
          getManagerSummary: jest.fn().mockResolvedValue({
            pending_activity_reviews: 1,
            pending_visit_reviews: 2,
          }),
        },
        dashboardDateService: {
          resolve: jest.fn().mockResolvedValue({
            dateFrom: '2026-10-01',
            dateTo: '2026-10-28',
            today: '2026-10-28',
            timezone: 'Africa/Dar_es_Salaam',
          }),
        } as unknown as DashboardDateService,
        probationCaseRepository: { count: jest.fn().mockResolvedValue(1) },
      },
    ) as ManagerSelfServiceService;

    const result = await service.getDashboard(actor, {
      date_from: '2026-10-01',
      date_to: '2026-10-28',
    });

    expect(result.team.total_members).toBe(6);
    expect(result.period).toEqual({
      date_from: '2026-10-01',
      date_to: '2026-10-28',
      today: '2026-10-28',
      timezone: 'Africa/Dar_es_Salaam',
    });
    expect(result.team.employees_on_leave).toBe(2);
    expect(result.attendance).toMatchObject({
      total_records: 4,
      present: 3,
      absent: 1,
    });
    expect(result.approvals.pending_attendance_corrections).toBe(1);
    expect(hrAccessService.getAccessibleEmployeeIds).not.toHaveBeenCalled();
    expect(service['dashboardDateService'].resolve).toHaveBeenCalledWith(
      { date_from: '2026-10-01', date_to: '2026-10-28' },
      10,
    );
    expect(queryBuilders).toHaveLength(4);
    for (const query of queryBuilders.slice(0, 1)) {
      expect(query.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('employee_scope.id'),
      );
    }
    for (const query of queryBuilders.slice(1)) {
      expect(query.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('SELECT employee_scope.id'),
      );
      expect(query.setParameters).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeCompanyId: 10,
          scopeManagerEmployeeId: 30,
        }),
      );
    }
  });
});
