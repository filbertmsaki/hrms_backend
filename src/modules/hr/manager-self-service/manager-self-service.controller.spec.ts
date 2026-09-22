import { ManagerSelfServiceController } from './manager-self-service.controller';
import { ManagerSelfServiceService } from './manager-self-service.service';
import { ActionItemsService } from '../action-inbox/action-items.service';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

describe('ManagerSelfServiceController', () => {
  let controller: ManagerSelfServiceController;
  let managerSelfService: {
    getDashboard: jest.Mock;
    getTeamMembers: jest.Mock;
    getTeamMemberSummary: jest.Mock;
    getTeamAttendance: jest.Mock;
  };
  let actionItemsService: {
    findMine: jest.Mock;
  };

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
      'manager_self_service:read',
      'manager_team:read',
      'team_attendance:read',
    ],
  };

  beforeEach(() => {
    managerSelfService = {
      getDashboard: jest.fn().mockResolvedValue({ pending_actions: 3 }),
      getTeamMembers: jest.fn().mockResolvedValue({ rows: [{ id: 701 }] }),
      getTeamMemberSummary: jest.fn().mockResolvedValue({ employee_id: 701 }),
      getTeamAttendance: jest.fn().mockResolvedValue({ rows: [{ id: 91 }] }),
    };
    actionItemsService = {
      findMine: jest.fn().mockResolvedValue({ rows: [{ id: 77 }] }),
    };
    controller = new ManagerSelfServiceController(
      managerSelfService as unknown as ManagerSelfServiceService,
      actionItemsService as unknown as ActionItemsService,
    );
  });

  it('declares team attendance before team member id route to avoid route shadowing', () => {
    const methodNames = Object.getOwnPropertyNames(
      ManagerSelfServiceController.prototype,
    );

    expect(methodNames.indexOf('getTeamAttendance')).toBeGreaterThan(-1);
    expect(methodNames.indexOf('getTeamMember')).toBeGreaterThan(-1);
    expect(methodNames.indexOf('getTeamAttendance')).toBeLessThan(
      methodNames.indexOf('getTeamMember'),
    );
  });

  it('routes manager dashboard and team calls through actor-scoped services', async () => {
    await expect(
      controller.getDashboard({ user } as never, {
        date_from: '2026-09-01',
        date_to: '2026-09-30',
      }),
    ).resolves.toEqual({ pending_actions: 3 });
    expect(managerSelfService.getDashboard).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        date_from: '2026-09-01',
        date_to: '2026-09-30',
      }),
    );

    await expect(
      controller.getTeam({ user } as never, {
        page: 2,
        limit: 10,
        direct_reports_only: true,
      }),
    ).resolves.toEqual({ rows: [{ id: 701 }] });
    expect(managerSelfService.getTeamMembers).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        page: 2,
        limit: 10,
        direct_reports_only: true,
      }),
    );

    await expect(
      controller.getTeamMember({ user } as never, 701),
    ).resolves.toEqual({ employee_id: 701 });
    expect(managerSelfService.getTeamMemberSummary).toHaveBeenCalledWith(
      user,
      701,
    );
  });

  it('routes action inbox and team attendance through scoped services', async () => {
    await expect(
      controller.getActionItems({ user } as never, {
        status: 'OPEN',
        source_module: 'leave',
        limit: 20,
      }),
    ).resolves.toEqual({ rows: [{ id: 77 }] });
    expect(actionItemsService.findMine).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        status: 'OPEN',
        source_module: 'leave',
        limit: 20,
      }),
    );

    await expect(
      controller.getTeamAttendance({ user } as never, {
        page: 1,
        date_from: '2026-09-01',
      }),
    ).resolves.toEqual({ rows: [{ id: 91 }] });
    expect(managerSelfService.getTeamAttendance).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ page: 1, date_from: '2026-09-01' }),
    );
  });
});
