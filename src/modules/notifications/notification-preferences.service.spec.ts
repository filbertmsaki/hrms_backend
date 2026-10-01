import { Repository } from 'typeorm';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationPreferencesService } from './notification-preferences.service';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let repository: Partial<jest.Mocked<Repository<NotificationPreference>>>;
  let companyUsers: { exists: jest.Mock; find: jest.Mock };

  beforeEach(() => {
    companyUsers = { exists: jest.fn(async () => true), find: jest.fn() };
    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((input) => input as NotificationPreference),
      save: jest.fn(async (entity) => entity as NotificationPreference),
      upsert: jest.fn(),
    };

    service = new NotificationPreferencesService(
      repository as Repository<NotificationPreference>,
      companyUsers as never,
    );
  });

  it('stores push preferences even when push delivery is not configured yet', async () => {
    await expect(
      service.setPreference(
        7,
        NotificationTypeEnum.GENERAL,
        NotificationChannelEnum.PUSH,
        true,
      ),
    ).resolves.toMatchObject({
      channel: NotificationChannelEnum.PUSH,
      isEnabled: true,
    });
  });

  it('returns every stored channel preference', async () => {
    repository.find!.mockResolvedValue([
      {
        channel: NotificationChannelEnum.IN_APP,
        notificationType: NotificationTypeEnum.GENERAL,
      },
      {
        channel: NotificationChannelEnum.EMAIL,
        notificationType: NotificationTypeEnum.GENERAL,
      },
      {
        channel: NotificationChannelEnum.SMS,
        notificationType: NotificationTypeEnum.GENERAL,
      },
      {
        channel: NotificationChannelEnum.PUSH,
        notificationType: NotificationTypeEnum.GENERAL,
      },
    ] as NotificationPreference[]);

    const preferences = await service.findMine(7);

    expect(preferences).toHaveLength(4);
    expect(preferences.map((preference) => preference.channel)).toEqual([
      NotificationChannelEnum.IN_APP,
      NotificationChannelEnum.EMAIL,
      NotificationChannelEnum.SMS,
      NotificationChannelEnum.PUSH,
    ]);
  });

  it('rejects attendance alert email preferences for users outside the company', async () => {
    companyUsers.exists.mockResolvedValue(false);

    await expect(
      service.updateAttendanceAlertEmailPreference(1, 99, { late: false }),
    ).rejects.toThrow('Company user not found.');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('defaults attendance alert emails to enabled and reflects stored opt-outs', async () => {
    repository.find!.mockResolvedValue([
      {
        notificationType: NotificationTypeEnum.ATTENDANCE_LATE,
        channel: NotificationChannelEnum.EMAIL,
        isEnabled: false,
      },
    ] as NotificationPreference[]);

    await expect(
      service.getAttendanceAlertEmailPreference(1, 7),
    ).resolves.toEqual({ company_user_id: 7, late: false, absent: true });
  });

  it('upserts attendance alert email preferences for every company user', async () => {
    companyUsers.find.mockResolvedValue([{ id: 7 }, { id: 8 }]);

    await expect(
      service.updateAttendanceAlertEmailPreferenceForCompany(1, {
        absent: false,
      }),
    ).resolves.toEqual({ updated_users: 2, absent: false });

    expect(companyUsers.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { company_id: 1 } }),
    );
    expect(repository.upsert).toHaveBeenCalledWith(
      [7, 8].map((companyMembershipId) => ({
        companyMembershipId,
        notificationType: NotificationTypeEnum.ATTENDANCE_MISSING,
        channel: NotificationChannelEnum.EMAIL,
        isEnabled: false,
      })),
      ['companyMembershipId', 'notificationType', 'channel'],
    );
  });

  it('suppresses the email channel once an attendance alert is opted out', async () => {
    repository.find!.mockResolvedValue([
      { channel: NotificationChannelEnum.EMAIL, isEnabled: false },
    ] as NotificationPreference[]);

    await expect(
      service.filterEnabledChannels(7, NotificationTypeEnum.ATTENDANCE_LATE, [
        NotificationChannelEnum.IN_APP,
        NotificationChannelEnum.EMAIL,
      ]),
    ).resolves.toEqual([NotificationChannelEnum.IN_APP]);
  });
});
