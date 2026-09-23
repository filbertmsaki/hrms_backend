import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../employees/entities/employee.entity';
import { AttendanceDailySummary } from '../attendance/processing/entities/attendance-daily-summary.entity';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { OnboardingRequest } from '../onboarding/entities/onboarding-request.entity';
import { OffboardingRequest } from '../offboarding/entities/offboarding-request.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { PerformanceInsightsService } from '../performance/services/performance-insights.service';
import { WorkActivityInsightsService } from '../work-activities/services/work-activity-insights.service';
import { PayrollReportsService } from '../payroll/services/payroll-core.services';
import { EmployeeFinanceReportsService } from '../employee-finance/services/employee-finance-core.services';
import { DashboardDateService } from './dashboard-date.service';
import { ManagementDashboardService } from './management-dashboard.service';

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

  const buildCountQueryBuilder = (count = 0) => {
    const qb: Record<string, jest.Mock> = {
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({
        total_records: '0',
        late: '0',
        absent: '0',
      }),
      getCount: jest.fn().mockResolvedValue(count),
    };
    for (const key of ['select', 'addSelect', 'where', 'andWhere']) {
      qb[key].mockReturnValue(qb);
    }
    return qb;
  };

  it('returns top performers as an available management dashboard widget', async () => {
    const hrAccessService = {
      getAccessibleEmployeeIds: jest.fn().mockResolvedValue([101, 102]),
    };
    const employeeRepository = {
      count: jest.fn().mockResolvedValue(2),
      createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
    };
    const topPerformers = [
      {
        rank: 1,
        employee_id: 101,
        employee_no: 'EMP-101',
        full_name: 'Asha Top',
        final_score: 96.5,
      },
    ];
    const performanceInsightsService = {
      getCompanySummary: jest.fn().mockResolvedValue({
        published_reviews: 1,
      }),
      getTopPerformers: jest.fn().mockResolvedValue(topPerformers),
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
      {
        createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
      } as unknown as Repository<LeaveRequest>,
      {
        count: jest.fn().mockResolvedValue(0),
        createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
      } as unknown as Repository<OnboardingRequest>,
      {
        count: jest.fn().mockResolvedValue(0),
        createQueryBuilder: jest.fn().mockReturnValue(buildCountQueryBuilder()),
      } as unknown as Repository<OffboardingRequest>,
      performanceInsightsService as unknown as PerformanceInsightsService,
      {
        getCompanySummary: jest.fn().mockResolvedValue({}),
      } as unknown as WorkActivityInsightsService,
      {
        dashboard: jest.fn().mockResolvedValue({}),
      } as unknown as PayrollReportsService,
      {
        dashboard: jest.fn().mockResolvedValue({}),
      } as unknown as EmployeeFinanceReportsService,
    );

    const result = await service.getDashboard(actor, {
      date_from: '2026-09-01',
      date_to: '2026-09-30',
    });

    expect(performanceInsightsService.getTopPerformers).toHaveBeenCalledWith(
      actor,
      [101, 102],
    );
    expect(result.top_performers).toEqual(topPerformers);
    expect(result.unavailable_widgets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TOP_PERFORMERS' }),
      ]),
    );
  });
});
