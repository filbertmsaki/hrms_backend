import { Repository } from 'typeorm';
import { NotificationRule } from './entities/notification-rule.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { NotificationChannelEnum } from './enums/notification-channel.enum';
import { NotificationConfigurationService } from './notification-configuration.service';

describe('NotificationConfigurationService', () => {
  let templateRepository: Partial<
    jest.Mocked<Repository<NotificationTemplate>>
  >;
  let ruleRepository: Partial<jest.Mocked<Repository<NotificationRule>>>;
  let service: NotificationConfigurationService;

  beforeEach(() => {
    templateRepository = {
      create: jest.fn((input) => input as NotificationTemplate),
      save: jest.fn(async (input) => input as NotificationTemplate),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    ruleRepository = {
      create: jest.fn((input) => input as NotificationRule),
      save: jest.fn(async (input) => input as NotificationRule),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    service = new NotificationConfigurationService(
      templateRepository as Repository<NotificationTemplate>,
      ruleRepository as Repository<NotificationRule>,
    );
  });

  it('renders an active template with supplied variables', async () => {
    const getOne = jest.fn().mockResolvedValue({
      id: 4,
      companyId: 2,
      templateCode: 'leave.approved',
      title: 'Leave approved for {{employee_name}}',
      systemMessage: '{{leave_type}} leave is approved.',
      emailSubject: 'Leave approved',
      emailBody: 'Hello {{employee_name}}, {{leave_type}} is approved.',
      mobileMessage: '{{leave_type}} approved',
    });
    templateRepository.createQueryBuilder!.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne,
    } as never);

    const rendered = await service.renderTemplate(2, 'leave.approved', {
      employee_name: 'Jane',
      leave_type: 'Annual',
    });

    expect(rendered).toEqual(
      expect.objectContaining({
        title: 'Leave approved for Jane',
        systemMessage: 'Annual leave is approved.',
        emailBody: 'Hello Jane, Annual is approved.',
        mobileMessage: 'Annual approved',
      }),
    );
  });

  it('creates rules with deduplicated channel configuration', async () => {
    const created = await service.createRule(7, {
      notification_type: 'PROBATION_CONFIRMATION_DUE',
      trigger_event: 'probation.due',
      recipient_type: 'DIRECT_SUPERVISOR',
      channels: [
        NotificationChannelEnum.IN_APP,
        NotificationChannelEnum.EMAIL,
        NotificationChannelEnum.EMAIL,
      ],
      reminder_before_minutes: 14 * 24 * 60,
    });

    expect(created).toEqual(
      expect.objectContaining({
        companyId: 7,
        notificationType: 'PROBATION_CONFIRMATION_DUE',
        triggerEvent: 'probation.due',
        recipientType: 'DIRECT_SUPERVISOR',
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
      }),
    );
  });
});
