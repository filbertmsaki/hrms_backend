import { DeviceHealthCronService } from './device-health-cron.service';

describe('device health monitoring', () => {
  it('checks subsequent devices after a failure and alerts on a sustained outage', async () => {
    const devices = {
      find: jest.fn().mockResolvedValue([
        { id: 1, companyId: 7 },
        { id: 2, companyId: 7 },
      ]),
      findOne: jest.fn().mockResolvedValue({
        deviceName: 'Front door',
        metadata: {
          operational: {
            connection_test: {
              consecutive_failures: 3,
              failure_started_at: '2026-01-01T10:00:00Z',
            },
          },
        },
      }),
    };
    const checker = {
      testConnection: jest
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ success: true }),
    };
    const lock = {
      runWithLock: jest.fn(async (_key: string, run: () => Promise<void>) => ({
        acquired: true,
        result: await run(),
      })),
    };
    const query: any = {};
    for (const name of ['leftJoin', 'where', 'andWhere', 'distinct'])
      query[name] = jest.fn().mockReturnValue(query);
    query.getMany = jest.fn().mockResolvedValue([{ id: 42 }]);
    const users = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const notifications = {
      createAndPush: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DeviceHealthCronService(
      devices as any,
      checker as any,
      lock as any,
      users as any,
      notifications as any,
    );
    await service.checkDevices();
    expect(checker.testConnection).toHaveBeenCalledTimes(2);
    expect(notifications.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 7,
        receiver_company_user_id: 42,
        dedupe_key: expect.stringContaining('2026-01-01T10:00:00Z'),
      }),
    );
  });
});
