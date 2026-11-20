import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AppNotification } from './entities/app-notification.entity';
import { WebPushSubscription } from './entities/web-push-subscription.entity';
import { WebPushService } from './web-push.service';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));

const actor = { companyId: 7, companyMembershipId: 12 } as AuthenticatedUser;
const endpoint = 'https://updates.push.services.mozilla.com/wpush/v2/example';
const keys = { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) };

function setup() {
  const values: Record<string, string> = {
    WEB_PUSH_VAPID_PUBLIC_KEY: 'public-key',
    WEB_PUSH_VAPID_PRIVATE_KEY: 'private-key',
    WEB_PUSH_SUBJECT: 'mailto:admin@example.com',
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  const repository = {
    upsert: jest.fn(),
    update: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as Repository<WebPushSubscription>;
  return { service: new WebPushService(config, repository), repository };
}

describe('WebPushService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registers a subscription for the authenticated company membership', async () => {
    const { service, repository } = setup();
    await service.register(actor, { endpoint, keys });
    expect(repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 7,
        companyUserId: 12,
        endpoint,
        isActive: true,
        endpointHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      { conflictPaths: ['endpointHash'] },
    );
  });

  it('rejects push endpoints on internal hosts', async () => {
    const { service, repository } = setup();
    await expect(
      service.register(actor, {
        endpoint: 'https://127.0.0.1/internal',
        keys,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('sends only to subscriptions scoped to the notification recipient and retires expired endpoints', async () => {
    const { service, repository } = setup();
    (repository.find as jest.Mock).mockResolvedValue([
      { id: 9, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    ]);
    (webPush.sendNotification as jest.Mock).mockRejectedValue({
      statusCode: 410,
    });
    await service.sendToNotification({
      id: 45,
      company_id: 7,
      receiver_company_user_id: 12,
      title: 'Approval needed',
      message: 'Review the request',
      action_url: '/dashboard/me/requests',
    } as AppNotification);
    expect(repository.find).toHaveBeenCalledWith({
      where: { companyId: 7, companyUserId: 12, isActive: true },
      take: 100,
    });
    expect(webPush.sendNotification).toHaveBeenCalledWith(
      { endpoint, keys },
      expect.stringContaining('"id":45'),
      expect.objectContaining({ TTL: 86400 }),
    );
    expect(repository.update).toHaveBeenCalledWith(9, { isActive: false });
  });
});
