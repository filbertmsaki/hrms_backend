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

  it('notifies the responsible manager when HR assigns an employee KPI', async () => {
    const notifications = {
      createAndPush: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const employees = {
      findOne: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve({ company_user_id: where.id === 12 ? 18 : 30 }),
        ),
    };
    const service = new KpiAssignmentNotificationService(
      employees as never,
      notifications as never,
    );
    await service.notify({ ...assignment, managerEmployeeId: 21 });
    expect(notifications.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver_company_user_id: 30,
        title: 'KPI assigned to your employee',
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
          NotificationChannelEnum.SMS,
          NotificationChannelEnum.PUSH,
        ],
      }),
    );
  });

  it('notifies the employee on all channels when a target is revised', async () => {
    const notifications = {
      createAndPush: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const service = new KpiAssignmentNotificationService(
      {
        findOne: jest.fn().mockResolvedValue({ company_user_id: 18 }),
      } as never,
      notifications as never,
    );
    await service.notifyTargetRevision(assignment, {
      id: 45,
      revision: 2,
      reason: 'Updated plan',
    } as never);
    expect(notifications.createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        receiver_company_user_id: 18,
        type: NotificationTypeEnum.KPI_TARGET_CHANGED,
        dedupe_key: 'kpi:target:revised:34:2:18',
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
          NotificationChannelEnum.SMS,
          NotificationChannelEnum.PUSH,
        ],
      }),
    );
  });
});
