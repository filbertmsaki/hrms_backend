import { AccessWeekPlansService } from './access-week-plans.service';

describe('week plan device push status', () => {
  it('does not advance the successful sync time when the device rejects the push', async () => {
    const lastSuccessful = new Date('2026-01-01T00:00:00Z');
    const plan = {
      id: 1,
      hikvisionPlanNo: '1',
      lastSyncedAt: lastSuccessful,
      metadata: null,
    };
    const save = jest
      .fn()
      .mockImplementation((value: unknown) => Promise.resolve(value));
    const service = Object.assign(
      Object.create(AccessWeekPlansService.prototype),
      {
        findOrFail: jest.fn().mockResolvedValue(plan),
        segmentRepository: { find: jest.fn().mockResolvedValue([]) },
        weekPlanRepository: { update: save },
        hikvisionAccessControlService: {
          putUserRightWeekPlanCfg: jest
            .fn()
            .mockResolvedValue({ ok: false, status: 503 }),
        },
      },
    ) as AccessWeekPlansService;
    const result = await service.syncWeekPlanToDevice(1, 1, 2);
    expect(result.ok).toBe(false);
    expect(plan.lastSyncedAt).toBe(lastSuccessful);
    expect(save).toHaveBeenCalled();
  });

  it.each([true, false])(
    'requires the same schedule in device read-back (enabled %s)',
    async (matches) => {
      const plan = {
        id: 1,
        deviceId: 2,
        enable: true,
        hikvisionPlanNo: '1',
        metadata: null,
      };
      const update = jest.fn().mockResolvedValue(undefined);
      const service = Object.assign(
        Object.create(AccessWeekPlansService.prototype),
        {
          findOrFail: jest.fn().mockResolvedValue(plan),
          segmentRepository: { find: jest.fn().mockResolvedValue([]) },
          weekPlanRepository: { update },
          hikvisionAccessControlService: {
            putUserRightWeekPlanCfg: jest
              .fn()
              .mockResolvedValue({ ok: true, status: 200 }),
            getUserRightWeekPlanCfg: jest
              .fn()
              .mockResolvedValue({
                ok: true,
                parsed: {
                  UserRightWeekPlanCfg: {
                    weekPlanNo: 1,
                    enable: matches,
                    WeekPlanCfg: [],
                  },
                },
              }),
          },
        },
      ) as AccessWeekPlansService;
      expect((await service.syncWeekPlanToDevice(8, 1, 2)).ok).toBe(matches);
      const change = update.mock.calls[0][1] as { lastSyncedAt?: Date };
      expect(Boolean(change.lastSyncedAt)).toBe(matches);
    },
  );
});
