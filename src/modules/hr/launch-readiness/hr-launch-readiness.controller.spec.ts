import { HrLaunchReadinessController } from './hr-launch-readiness.controller';
import { HrLaunchReadinessService } from './hr-launch-readiness.service';
import { EmployeeAttendanceReadinessService } from './employee-attendance-readiness.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

describe('HrLaunchReadinessController', () => {
  let controller: HrLaunchReadinessController;
  let readinessService: { check: jest.Mock };
  let employeeReadinessService: { check: jest.Mock };

  const user: AuthenticatedUser = {
    id: 1,
    email: 'hr@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 17,
    companyMembershipId: 44,
    roles: ['HR Admin'],
    permissions: ['hrms_launch_readiness:read'],
  };

  beforeEach(() => {
    readinessService = {
      check: jest.fn().mockResolvedValue({ is_ready_for_launch: true }),
    };
    employeeReadinessService = {
      check: jest.fn().mockResolvedValue({ summary: { totalEmployees: 2 } }),
    };
    controller = new HrLaunchReadinessController(
      readinessService as unknown as HrLaunchReadinessService,
      employeeReadinessService as unknown as EmployeeAttendanceReadinessService,
    );
  });

  it('uses the authenticated tenant for the launch checklist', async () => {
    await expect(controller.check({ user } as never)).resolves.toEqual({
      is_ready_for_launch: true,
    });

    expect(readinessService.check).toHaveBeenCalledWith(17);
  });

  it('uses the authenticated tenant for per-employee readiness', async () => {
    await expect(
      controller.employeeReadiness({ user } as never),
    ).resolves.toEqual({ summary: { totalEmployees: 2 } });

    expect(employeeReadinessService.check).toHaveBeenCalledWith(17);
  });
});
