import { NotificationChannelEnum } from '../../notifications/enums/notification-channel.enum';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import { KpiAssignmentNotificationService } from './kpi-assignment-notification.service';
import { KpiAssignment, KpiDefinitionVersion, KpiPeriod } from './kpi.entities';

describe('KPI assignment notification', () => {
  const assignment = {
    id: 34,
    companyId: 7,
    subjectType: 'employee',
    subjectId: 12,
    definitionVersion: { name: 'Customer retention' },
    period: {
      label: 'November 2026',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    },
  } as KpiAssignment & {
    definitionVersion: KpiDefinitionVersion;
    period: KpiPeriod;
  };

  it('notifies the assigned employee on all available channels with a direct link', async () => {
    const employees = {
      findOne: jest.fn().mockResolvedValue({ company_user_id: 18 }),
    };
    const notifications = {
      createAndPush: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const service = new KpiAssignmentNotificationService(
      employees as never,
      notifications as never,
    );
    await service.notify(assignment);
    expect(employees.findOne).toHaveBeenCalledWith({
      where: {
        id: 12,
        company_id: 7,
        company_user: { status: 'active', company_id: 7 },
      },
    });
    expect(notifications.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver_company_user_id: 18,
        type: NotificationTypeEnum.KPI_ASSIGNED,
        action_url: '/dashboard/me/kpi/34',
        dedupe_key: 'kpi:assignment:created:34:18',
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
          NotificationChannelEnum.SMS,
          NotificationChannelEnum.PUSH,
        ],
      }),
    );
  });

  it('does not notify an employee without an active membership', async () => {
    const notifications = { createAndPush: jest.fn() };
    const service = new KpiAssignmentNotificationService(
      {
        findOne: jest.fn().mockResolvedValue({ company_user_id: null }),
      } as never,
      notifications as never,
    );
    await service.notify(assignment);
    expect(notifications.createAndPush).not.toHaveBeenCalled();
  });
});
