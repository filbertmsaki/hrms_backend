import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationTypeEnum } from './enums/notification-type.enum';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationPreferencesService } from './notification-preferences.service';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let repository: Partial<jest.Mocked<Repository<NotificationPreference>>>;

  beforeEach(() => {
    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((input) => input as NotificationPreference),
      save: jest.fn(async (entity) => entity as NotificationPreference),
    };

    service = new NotificationPreferencesService(
      repository as Repository<NotificationPreference>,
    );
  });

  it('rejects unsupported notification channels when saving preferences', async () => {
    await expect(
      service.setPreference(
        7,
        NotificationTypeEnum.GENERAL,
        NotificationChannelEnum.PUSH,
        true,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns only supported channels from stored preferences', async () => {
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

    expect(preferences).toHaveLength(3);
    expect(preferences.map((preference) => preference.channel)).toEqual([
      NotificationChannelEnum.IN_APP,
      NotificationChannelEnum.EMAIL,
      NotificationChannelEnum.SMS,
    ]);
  });
});
