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
        weekPlanRepository: { save },
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
});
