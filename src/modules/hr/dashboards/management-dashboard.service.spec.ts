import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { WorkActivityInsightsService } from '../work-activities/services/work-activity-insights.service';
import { PayrollReportsService } from '../payroll/services/payroll-core.services';
import { EmployeeFinanceReportsService } from '../employee-finance/services/employee-finance-core.services';
import { DashboardDateService } from './dashboard-date.service';
import { ManagementDashboardService } from './management-dashboard.service';
import { DashboardLeaveService } from './dashboard-leave.service';
import { ActionItemsService } from '../action-inbox/action-items.service';

describe('ManagementDashboardService', () => {
  const actor: AuthenticatedUser = {
    id: 1,
    email: 'executive@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 20,
    employeeId: 30,
    roles: [],
    permissions: [],
  };

  const buildCountQueryBuilder = (
    count = 0,
    rawRows: Array<Record<string, string | number | null>> = [],
  ) => {
    const qb: Record<string, jest.Mock> = {
      select: jest.fn(),
      addSelect: jest.fn(),
      leftJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      setParameters: jest.fn(),
      groupBy: jest.fn(),
      addGroupBy: jest.fn(),
      orderBy: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue(rawRows),
      getRawOne: jest.fn().mockResolvedValue({
        total_records: '0',
        late: '0',
        absent: '0',
      }),
      getCount: jest.fn().mockResolvedValue(count),
    };
    for (const key of [
      'select',
      'addSelect',
      'leftJoin',
      'where',
      'andWhere',
      'setParameters',
      'groupBy',
      'addGroupBy',
      'orderBy',
    ]) {
      qb[key].mockReturnValue(qb);
    }
    return qb;
  };

  it('returns scoped management dashboard widgets', async () => {
    const hrAccessService = {
      getAccessibleEmployeeIds: jest.fn().mockResolvedValue([101, 102]),
      getAccessibleEmployeeSqlScope: jest.fn().mockResolvedValue({
        companyWide: true,
        actorEmployeeId: null,
        branchIds: [],
        departmentIds: [],
        managerEmployeeId: null,
      }),
    };
    const employeeRepository = {
      count: jest.fn().mockResolvedValue(2),
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(
          buildCountQueryBuilder(0, [
            {
              department_id: '4',
              department_name: 'Operations',
              headcount: '2',
            },
          ]),
        )
        .mockReturnValueOnce(
          buildCountQueryBuilder(0, [
            { branch_id: '7', branch_name: 'Dar es Salaam', headcount: '2' },
          ]),
        )
        .mockReturnValue(buildCountQueryBuilder()),
    };
    const workActivitySummary = {
      approved_reports: 3,
      reviewed_visits: 5,
      customer_visits: 2,
      broker_intermediary_visits: 1,
      planned_visit_items: 8,
      completed_planned_visit_items: 6,
      planned_visit_completion_rate: 75,
    };
    const workActivityInsightsService = {
      getCompanySummary: jest.fn().mockResolvedValue(workActivitySummary),
    };
    const leaveQueryBuilder = buildCountQueryBuilder();
    const leaveRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(leaveQueryBuilder),
    };
    const service = new ManagementDashboardService(
      hrAccessService as unknown as HrAccessService,
      {
        resolve: jest.fn().mockReturnValue({
          dateFrom: '2026-09-01',
          dateTo: '2026-09-30',
          today: '2026-09-30',
        }),
      } as unknown as DashboardDateService,
      employeeRepository as unknown as Repository<Employee>,
      {
        createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
      } as unknown as Repository<AttendanceDailySummary>,
      leaveRepository as unknown as Repository<LeaveRequest>,
      {
        count: jest.fn().mockResolvedValue(0),
        createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
      } as unknown as Repository<OnboardingRequest>,
      {
        count: jest.fn().mockResolvedValue(0),
        createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
      } as unknown as Repository<OffboardingRequest>,
      workActivityInsightsService as unknown as WorkActivityInsightsService,
      {
        dashboard: jest.fn().mockResolvedValue({}),
      } as unknown as PayrollReportsService,
      {
        dashboard: jest.fn().mockResolvedValue({}),
      } as unknown as EmployeeFinanceReportsService,
      {
        getApprovedLeaveDaysByType: jest.fn().mockResolvedValue({
          available: true,
          unallocated_approved_requests: 0,
          items: [],
        }),
      } as unknown as DashboardLeaveService,
      {
        countOpen: jest.fn().mockResolvedValue(2),
      } as unknown as ActionItemsService,
    );

    const result = await service.getDashboard(actor, {
      date_from: '2026-09-01',
      date_to: '2026-09-30',
      employee_id: 101,
    });

    expect(hrAccessService.getAccessibleEmployeeSqlScope).toHaveBeenCalledWith(
      actor,
    );
    expect(hrAccessService.getAccessibleEmployeeIds).not.toHaveBeenCalled();
    expect(workActivityInsightsService.getCompanySummary).toHaveBeenCalledWith(
      actor,
      '2026-09-01',
      '2026-09-30',
      { employee_id: 101 },
    );
    expect(result.filters).toMatchObject({ employee_id: 101 });
    expect(result.leave.pending_requests).toBe(0);
    expect(result.workflow_pipeline.leave).toBe(0);
    expect(result.action_inbox).toEqual({
      assigned_open_items: 2,
      population: 'SIGNED_IN_ASSIGNEE',
    });
    expect(leaveQueryBuilder.andWhere).toHaveBeenCalledWith(
      'leave.status IN (:...statuses)',
      {
        statuses: ['pending_department_manager', 'pending_hr', 'in_review'],
      },
    );
    expect(leaveQueryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('leave.employee_id IN (SELECT employee_scope.id'),
    );
    expect(result.work_activities).toEqual(workActivitySummary);
    expect(result.unavailable_widgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EMPLOYEE_LEVEL_FIELD_PRODUCTIVITY',
          available: false,
        }),
        expect.objectContaining({
          code: 'CRM_COMMERCIAL_OUTCOMES',
          available: false,
        }),
      ]),
    );
    expect(result.workforce.department_headcount).toEqual([
      { department_id: 4, department_name: 'Operations', headcount: 2 },
    ]);
    expect(result.workforce.branch_headcount).toEqual([
      { branch_id: 7, branch_name: 'Dar es Salaam', headcount: 2 },
    ]);
  });
});
