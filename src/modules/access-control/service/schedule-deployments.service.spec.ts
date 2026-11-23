import { DataSource } from 'typeorm';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import { CompaniesService } from '../../companies/companies.service';
import { AccessScheduleTemplatesService } from '../access-schedule-templates/service/access-schedule-templates.service';
import { AccessWeekPlansService } from '../access-week-plans/service/access-week-plans.service';
import { ScheduleDeploymentsService } from './schedule-deployments.service';

describe('automatic schedule deployment', () => {
  const permissions = [
    'data_scope:company',
    'access_control_sync:execute',
    'access_week_plans:update',
  ];
  function harness(grants = permissions, verified = true, deviceId = 4) {
    const job = {
      company_id: 2,
      kind: 'week-plan',
      resource_id: 3,
      device_id: 4,
      user_id: 8,
      membership_id: 10,
      revision: 5,
      verified_revision: 2,
      configuration: { device_id: deviceId },
    };
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.startsWith('SELECT j.')) return [job];
      if (sql.startsWith('SELECT upper')) return [{ active: true }];
      return [];
    });
    const sync = jest.fn().mockResolvedValue({
      ok: verified,
      message: verified ? 'Verified' : 'Read-back mismatch',
    });
    const lock = {
      runWithLock: async (_key: string, cb: () => Promise<void>) => ({
        acquired: true,
        result: await cb(),
      }),
    };
    const memberships = {
      getMembershipContext: jest
        .fn()
        .mockResolvedValue({ membershipId: 10, permissions: grants }),
    };
    const service = new ScheduleDeploymentsService(
      { query } as unknown as DataSource,
      lock as unknown as PostgresAdvisoryLockService,
      memberships as unknown as CompaniesService,
      { syncWeekPlanToDevice: sync } as unknown as AccessWeekPlansService,
      {} as AccessScheduleTemplatesService,
    );
    return { service, sync, query, memberships };
  }
  it('checks current membership and records only the revision read back from the assigned device', async () => {
    const { service, sync, memberships, query } = harness();
    await service.run();
    expect(memberships.getMembershipContext).toHaveBeenCalledWith(8, 2);
    expect(sync).toHaveBeenCalledWith(2, 3, 4);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE access_schedule_deployments'),
      [2, 'week-plan', 3, true, 5, 'Verified on device', 5],
    );
  });
  it('keeps the previously verified revision after a failed read-back', async () => {
    const { service, query } = harness(permissions, false);
    await service.run();
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [
      2,
      'week-plan',
      3,
      true,
      2,
      'Read-back mismatch',
      5,
    ]);
  });
  it.each([
    [['data_scope:company'], 4],
    [permissions, 9],
  ] as const)(
    'pauses before calling hardware if the permission or device changes',
    async (grants, id) => {
      const { service, sync, query } = harness([...grants], true, id);
      await service.run();
      expect(sync).not.toHaveBeenCalled();
      expect(query).toHaveBeenLastCalledWith(expect.any(String), [
        2,
        'week-plan',
        3,
        false,
        2,
        expect.any(String),
        5,
      ]);
    },
  );
});
