import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import { KpiPeriodNotificationService } from './kpi-period-notification.service';
import { KpiPeriod } from './kpi.entities';

describe('KPI period employee broadcast', () => {
  const period = {
    id: 42,
    companyId: 7,
    label: 'November 2026',
    startDate: '2026-11-01',
    endDate: '2026-11-30',
  } as KpiPeriod;

  it('uses selected channels for active company employees and a stable per-recipient key', async () => {
    const employees = {
      find: jest.fn().mockResolvedValueOnce([
        { id: 1, company_user_id: 11 },
        { id: 2, company_user_id: 12 },
      ]),
    };
    const notifications = {
      createAndPush: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const preferences = {
      findMine: jest
        .fn()
        .mockResolvedValueOnce([
          {
            notificationType: NotificationTypeEnum.KPI_PERIOD_CREATED,
            channel: NotificationChannelEnum.EMAIL,
            isEnabled: true,
          },
          {
            notificationType: NotificationTypeEnum.KPI_PERIOD_CREATED,
            channel: NotificationChannelEnum.SMS,
            isEnabled: false,
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const service = new KpiPeriodNotificationService(
      employees as never,
      notifications as never,
      preferences as never,
    );
    await service.broadcast(period);
    expect(employees.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          company_id: 7,
          company_user: { status: 'active', company_id: 7 },
        }),
        take: 200,
      }),
    );
    expect(notifications.createAndPush).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        receiver_company_user_id: 11,
        channels: [NotificationChannelEnum.EMAIL],
        dedupe_key: 'kpi:period:created:42:11',
        action_url: '/dashboard/me/kpi',
      }),
    );
    expect(notifications.createAndPush).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        receiver_company_user_id: 12,
        channels: [NotificationChannelEnum.IN_APP],
        dedupe_key: 'kpi:period:created:42:12',
      }),
    );
  });

  it('continues to later recipients when one notification fails', async () => {
    const employees = {
      find: jest.fn().mockResolvedValue([
        { id: 1, company_user_id: 11 },
        { id: 2, company_user_id: 12 },
      ]),
    };
    const notifications = {
      createAndPush: jest
        .fn()
        .mockRejectedValueOnce(new Error('queue down'))
        .mockResolvedValueOnce({ id: 2 }),
    };
    const preferences = { findMine: jest.fn().mockResolvedValue([]) };
    const service = new KpiPeriodNotificationService(
      employees as never,
      notifications as never,
      preferences as never,
    );
    await expect(service.broadcast(period)).resolves.toBeUndefined();
    expect(notifications.createAndPush).toHaveBeenCalledTimes(2);
  });
});
