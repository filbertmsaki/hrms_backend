import { DashboardsController } from './dashboards.controller';
import { EmployeeDashboardService } from './employee-dashboard.service';
import { HrDashboardService } from './hr-dashboard.service';
import { ManagementDashboardService } from './management-dashboard.service';
import { ManagerDashboardService } from './manager-dashboard.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

describe('DashboardsController', () => {
  let controller: DashboardsController;
  let employeeDashboardService: { getDashboard: jest.Mock };
  let managerDashboardService: { getDashboard: jest.Mock };
  let hrDashboardService: { getDashboard: jest.Mock };
  let managementDashboardService: { getDashboard: jest.Mock };

  const user: AuthenticatedUser = {
    id: 41,
    email: 'manager@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 310,
    employeeId: 701,
    roles: ['Manager'],
    permissions: [
      'dashboard:employee',
      'dashboard:manager',
      'dashboard:hr',
      'dashboard:management',
    ],
  };

  beforeEach(() => {
    employeeDashboardService = {
      getDashboard: jest.fn().mockResolvedValue({ profile_completion: 90 }),
    };
    managerDashboardService = {
      getDashboard: jest.fn().mockResolvedValue({ team_count: 7 }),
    };
    hrDashboardService = {
      getDashboard: jest.fn().mockResolvedValue({ headcount: 120 }),
    };
    managementDashboardService = {
      getDashboard: jest.fn().mockResolvedValue({ attrition_rate: 2.1 }),
    };
    controller = new DashboardsController(
      employeeDashboardService as unknown as EmployeeDashboardService,
      managerDashboardService as unknown as ManagerDashboardService,
      hrDashboardService as unknown as HrDashboardService,
      managementDashboardService as unknown as ManagementDashboardService,
    );
  });

  it('routes employee dashboard through the employee-scoped service', async () => {
    await expect(controller.employee({ user } as never)).resolves.toEqual({
      profile_completion: 90,
    });

    expect(employeeDashboardService.getDashboard).toHaveBeenCalledWith(user);
  });

  it('routes manager, HR, and management dashboard filters to their services', async () => {
    await expect(
      controller.manager({ user } as never, {
        branch_id: 4,
        department_id: 8,
      }),
    ).resolves.toEqual({ team_count: 7 });
    expect(managerDashboardService.getDashboard).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ branch_id: 4, department_id: 8 }),
    );

    await expect(
      controller.hr({ user } as never, { date_from: '2026-09-01' }),
    ).resolves.toEqual({ headcount: 120 });
    expect(hrDashboardService.getDashboard).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ date_from: '2026-09-01' }),
    );

    await expect(
      controller.management({ user } as never, { date_to: '2026-09-30' }),
    ).resolves.toEqual({ attrition_rate: 2.1 });
    expect(managementDashboardService.getDashboard).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ date_to: '2026-09-30' }),
    );
  });
});
